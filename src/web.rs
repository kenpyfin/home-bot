use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};
use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::{broadcast, Mutex};
use tracing::{error, info};

use crate::config::Config;
use crate::db::{ChatSummary, StoredMessage};
use crate::telegram::{process_with_agent, process_with_agent_with_events, AgentEvent, AppState};

static WEB_ASSETS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/web");

#[derive(Clone)]
struct WebState {
    app_state: Arc<AppState>,
    auth_token: Option<String>,
    run_hub: RunHub,
}

#[derive(Clone, Debug)]
struct RunEvent {
    event: String,
    data: String,
}

#[derive(Clone, Default)]
struct RunHub {
    channels: Arc<Mutex<HashMap<String, broadcast::Sender<RunEvent>>>>,
}

impl RunHub {
    async fn create(&self, run_id: &str) -> broadcast::Sender<RunEvent> {
        let (tx, _) = broadcast::channel(512);
        let mut guard = self.channels.lock().await;
        guard.insert(run_id.to_string(), tx.clone());
        tx
    }

    async fn get(&self, run_id: &str) -> Option<broadcast::Sender<RunEvent>> {
        let guard = self.channels.lock().await;
        guard.get(run_id).cloned()
    }

    async fn remove_later(&self, run_id: String, after_seconds: u64) {
        let channels = self.channels.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(after_seconds)).await;
            let mut guard = channels.lock().await;
            guard.remove(&run_id);
        });
    }
}

fn auth_token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|raw| raw.strip_prefix("Bearer "))
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn require_auth(
    headers: &HeaderMap,
    query_token: Option<&str>,
    expected_token: Option<&str>,
) -> Result<(), (StatusCode, String)> {
    let Some(expected) = expected_token else {
        return Ok(());
    };

    let provided = auth_token_from_headers(headers)
        .or_else(|| query_token.map(|s| s.to_string()))
        .unwrap_or_default();

    if provided == expected {
        Ok(())
    } else {
        Err((StatusCode::UNAUTHORIZED, "unauthorized".into()))
    }
}

fn normalize_session_key(session_key: Option<&str>) -> String {
    let key = session_key.unwrap_or("main").trim();
    if key.is_empty() {
        "main".into()
    } else {
        key.into()
    }
}

fn session_key_to_chat_id(session_key: &str) -> i64 {
    // Stable mapping into i64 space; we mark these chats with chat_type="web".
    let mut hasher = DefaultHasher::new();
    format!("web:{session_key}").hash(&mut hasher);
    let hash = hasher.finish();
    (hash & 0x3FFF_FFFF_FFFF_FFFF) as i64
}

#[derive(Debug, Serialize)]
struct SessionItem {
    session_key: String,
    chat_id: i64,
    last_message_time: String,
    last_message_preview: Option<String>,
}

#[derive(Debug, Serialize)]
struct HistoryItem {
    id: String,
    sender_name: String,
    content: String,
    is_from_bot: bool,
    timestamp: String,
}

#[derive(Debug, Deserialize)]
struct HistoryQuery {
    session_key: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct SendRequest {
    session_key: Option<String>,
    sender_name: Option<String>,
    message: String,
}

#[derive(Debug, Deserialize)]
struct StreamQuery {
    run_id: String,
    token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ResetRequest {
    session_key: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateConfigRequest {
    llm_provider: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    llm_base_url: Option<Option<String>>,
    max_tokens: Option<u32>,
    max_tool_iterations: Option<usize>,
    show_thinking: Option<bool>,
    web_enabled: Option<bool>,
    web_host: Option<String>,
    web_port: Option<u16>,
    web_auth_token: Option<Option<String>>,
}

fn config_path_for_save() -> Result<PathBuf, (StatusCode, String)> {
    match Config::resolve_config_path() {
        Ok(Some(path)) => Ok(path),
        Ok(None) => Ok(PathBuf::from("./microclaw.config.yaml")),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

fn redact_config(config: &Config) -> serde_json::Value {
    let mut cfg = config.clone();
    if !cfg.telegram_bot_token.is_empty() {
        cfg.telegram_bot_token = "***".into();
    }
    if !cfg.api_key.is_empty() {
        cfg.api_key = "***".into();
    }
    if cfg.openai_api_key.is_some() {
        cfg.openai_api_key = Some("***".into());
    }
    if cfg.whatsapp_access_token.is_some() {
        cfg.whatsapp_access_token = Some("***".into());
    }
    if cfg.whatsapp_verify_token.is_some() {
        cfg.whatsapp_verify_token = Some("***".into());
    }
    if cfg.discord_bot_token.is_some() {
        cfg.discord_bot_token = Some("***".into());
    }
    if cfg.web_auth_token.is_some() {
        cfg.web_auth_token = Some("***".into());
    }

    json!(cfg)
}

fn serve_asset(path: &str, content_type: &str) -> impl IntoResponse {
    match WEB_ASSETS.get_file(path) {
        Some(file) => ([("content-type", content_type)], file.contents().to_vec()).into_response(),
        None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
    }
}

async fn index() -> impl IntoResponse {
    match WEB_ASSETS.get_file("index.html") {
        Some(file) => Html(String::from_utf8_lossy(file.contents()).to_string()).into_response(),
        None => (StatusCode::NOT_FOUND, "index.html missing").into_response(),
    }
}

async fn app_js() -> impl IntoResponse {
    serve_asset("app.js", "application/javascript; charset=utf-8")
}

async fn api_health(
    headers: HeaderMap,
    State(state): State<WebState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_auth(&headers, None, state.auth_token.as_deref())?;
    Ok(Json(json!({
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "web_enabled": state.app_state.config.web_enabled,
    })))
}

async fn api_get_config(
    headers: HeaderMap,
    State(state): State<WebState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_auth(&headers, None, state.auth_token.as_deref())?;

    let path = config_path_for_save()?;
    Ok(Json(json!({
        "ok": true,
        "path": path,
        "config": redact_config(&state.app_state.config),
        "requires_restart": true
    })))
}

async fn api_update_config(
    headers: HeaderMap,
    State(state): State<WebState>,
    Json(body): Json<UpdateConfigRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_auth(&headers, None, state.auth_token.as_deref())?;

    let mut cfg = state.app_state.config.clone();

    if let Some(v) = body.llm_provider {
        cfg.llm_provider = v;
    }
    if let Some(v) = body.api_key {
        cfg.api_key = v;
    }
    if let Some(v) = body.model {
        cfg.model = v;
    }
    if let Some(v) = body.llm_base_url {
        cfg.llm_base_url = v;
    }
    if let Some(v) = body.max_tokens {
        cfg.max_tokens = v;
    }
    if let Some(v) = body.max_tool_iterations {
        cfg.max_tool_iterations = v;
    }
    if let Some(v) = body.show_thinking {
        cfg.show_thinking = v;
    }
    if let Some(v) = body.web_enabled {
        cfg.web_enabled = v;
    }
    if let Some(v) = body.web_host {
        cfg.web_host = v;
    }
    if let Some(v) = body.web_port {
        cfg.web_port = v;
    }
    if let Some(v) = body.web_auth_token {
        cfg.web_auth_token = v;
    }

    if let Err(e) = cfg.post_deserialize() {
        return Err((StatusCode::BAD_REQUEST, e.to_string()));
    }

    let path = config_path_for_save()?;
    cfg.save_yaml(&path.to_string_lossy())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(json!({
        "ok": true,
        "path": path,
        "requires_restart": true
    })))
}

fn map_chat_to_session(chat: ChatSummary) -> SessionItem {
    let fallback = format!("web-{}", chat.chat_id);
    let session_key = chat.chat_title.unwrap_or(fallback);

    SessionItem {
        session_key,
        chat_id: chat.chat_id,
        last_message_time: chat.last_message_time,
        last_message_preview: chat.last_message_preview,
    }
}

async fn api_sessions(
    headers: HeaderMap,
    State(state): State<WebState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_auth(&headers, None, state.auth_token.as_deref())?;

    let chats = state
        .app_state
        .db
        .get_chats_by_type("web", 200)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let sessions = chats
        .into_iter()
        .map(map_chat_to_session)
        .collect::<Vec<_>>();
    Ok(Json(json!({ "ok": true, "sessions": sessions })))
}

async fn api_history(
    headers: HeaderMap,
    State(state): State<WebState>,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_auth(&headers, None, state.auth_token.as_deref())?;

    let session_key = normalize_session_key(query.session_key.as_deref());
    let chat_id = session_key_to_chat_id(&session_key);

    let mut messages = state
        .app_state
        .db
        .get_all_messages(chat_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(limit) = query.limit {
        if messages.len() > limit {
            messages = messages[messages.len() - limit..].to_vec();
        }
    }

    let items: Vec<HistoryItem> = messages
        .into_iter()
        .map(|m| HistoryItem {
            id: m.id,
            sender_name: m.sender_name,
            content: m.content,
            is_from_bot: m.is_from_bot,
            timestamp: m.timestamp,
        })
        .collect();

    Ok(Json(json!({
        "ok": true,
        "session_key": session_key,
        "chat_id": chat_id,
        "messages": items,
    })))
}

async fn api_send(
    headers: HeaderMap,
    State(state): State<WebState>,
    Json(body): Json<SendRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_auth(&headers, None, state.auth_token.as_deref())?;
    send_and_store_response(state, body).await
}

async fn api_send_stream(
    headers: HeaderMap,
    State(state): State<WebState>,
    Json(body): Json<SendRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_auth(&headers, None, state.auth_token.as_deref())?;

    let text = body.message.trim().to_string();
    if text.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "message is required".into()));
    }

    let run_id = uuid::Uuid::new_v4().to_string();
    let sender = state.run_hub.create(&run_id).await;
    let state_for_task = state.clone();
    let run_id_for_task = run_id.clone();

    tokio::spawn(async move {
        let _ = sender.send(RunEvent {
            event: "status".into(),
            data: json!({"message": "running"}).to_string(),
        });

        let (evt_tx, mut evt_rx) = tokio::sync::mpsc::unbounded_channel::<AgentEvent>();
        let event_sender = sender.clone();
        let forward = tokio::spawn(async move {
            while let Some(evt) = evt_rx.recv().await {
                match evt {
                    AgentEvent::Iteration { iteration } => {
                        let _ = event_sender.send(RunEvent {
                            event: "status".into(),
                            data: json!({"message": format!("iteration {iteration}")}).to_string(),
                        });
                    }
                    AgentEvent::ToolStart { name } => {
                        let _ = event_sender.send(RunEvent {
                            event: "tool_start".into(),
                            data: json!({"name": name}).to_string(),
                        });
                    }
                    AgentEvent::ToolResult {
                        name,
                        is_error,
                        preview,
                    } => {
                        let _ = event_sender.send(RunEvent {
                            event: "tool_result".into(),
                            data: json!({"name": name, "is_error": is_error, "preview": preview})
                                .to_string(),
                        });
                    }
                    AgentEvent::FinalResponse { .. } => {}
                }
            }
        });

        match send_and_store_response_with_events(state_for_task.clone(), body, Some(&evt_tx)).await
        {
            Ok(resp) => {
                let response_text = resp
                    .0
                    .get("response")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();

                for chunk in chunk_text(&response_text, 80) {
                    let _ = sender.send(RunEvent {
                        event: "delta".into(),
                        data: json!({"delta": chunk}).to_string(),
                    });
                    tokio::time::sleep(std::time::Duration::from_millis(18)).await;
                }

                let _ = sender.send(RunEvent {
                    event: "done".into(),
                    data: json!({"response": response_text}).to_string(),
                });
            }
            Err((_, err_msg)) => {
                let _ = sender.send(RunEvent {
                    event: "error".into(),
                    data: json!({"error": err_msg}).to_string(),
                });
            }
        }
        drop(evt_tx);
        let _ = forward.await;

        state_for_task
            .run_hub
            .remove_later(run_id_for_task, 300)
            .await;
    });

    Ok(Json(json!({
        "ok": true,
        "run_id": run_id,
    })))
}

async fn api_stream(
    headers: HeaderMap,
    State(state): State<WebState>,
    Query(query): Query<StreamQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    require_auth(
        &headers,
        query.token.as_deref(),
        state.auth_token.as_deref(),
    )?;

    let Some(channel) = state.run_hub.get(&query.run_id).await else {
        return Err((StatusCode::NOT_FOUND, "run not found".into()));
    };

    let mut rx = channel.subscribe();
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(evt) => {
                    let done = evt.event == "done" || evt.event == "error";
                    let event = Event::default().event(evt.event).data(evt.data);
                    yield Ok::<Event, std::convert::Infallible>(event);
                    if done {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => {
                    break;
                }
            }
        }
    };

    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keepalive"),
    ))
}

async fn send_and_store_response(
    state: WebState,
    body: SendRequest,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    send_and_store_response_with_events(state, body, None).await
}

async fn send_and_store_response_with_events(
    state: WebState,
    body: SendRequest,
    event_tx: Option<&tokio::sync::mpsc::UnboundedSender<AgentEvent>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let text = body.message.trim().to_string();
    if text.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "message is required".into()));
    }

    let session_key = normalize_session_key(body.session_key.as_deref());
    let chat_id = session_key_to_chat_id(&session_key);
    let sender_name = body
        .sender_name
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("web-user")
        .to_string();

    state
        .app_state
        .db
        .upsert_chat(chat_id, Some(&session_key), "web")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user_msg = StoredMessage {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id,
        sender_name: sender_name.clone(),
        content: text,
        is_from_bot: false,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    state
        .app_state
        .db
        .store_message(&user_msg)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response = if let Some(tx) = event_tx {
        process_with_agent_with_events(
            &state.app_state,
            chat_id,
            &sender_name,
            "private",
            None,
            None,
            Some(tx),
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else {
        process_with_agent(&state.app_state, chat_id, &sender_name, "private", None, None)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    };

    let bot_msg = StoredMessage {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id,
        sender_name: state.app_state.config.bot_username.clone(),
        content: response.clone(),
        is_from_bot: true,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    state
        .app_state
        .db
        .store_message(&bot_msg)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(json!({
        "ok": true,
        "session_key": session_key,
        "chat_id": chat_id,
        "response": response,
    })))
}

async fn api_reset(
    headers: HeaderMap,
    State(state): State<WebState>,
    Json(body): Json<ResetRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_auth(&headers, None, state.auth_token.as_deref())?;

    let session_key = normalize_session_key(body.session_key.as_deref());
    let chat_id = session_key_to_chat_id(&session_key);

    let deleted = state
        .app_state
        .db
        .delete_session(chat_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(json!({ "ok": true, "deleted": deleted })))
}

fn chunk_text(text: &str, max_chars: usize) -> Vec<String> {
    if text.is_empty() {
        return vec![];
    }
    if text.chars().count() <= max_chars {
        return vec![text.to_string()];
    }

    let mut out = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if current.chars().count() >= max_chars {
            out.push(current);
            current = String::new();
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

pub async fn start_web_server(state: Arc<AppState>) {
    let web_state = WebState {
        auth_token: state.config.web_auth_token.clone(),
        app_state: state.clone(),
        run_hub: RunHub::default(),
    };

    let router = Router::new()
        .route("/", get(index))
        .route("/app.js", get(app_js))
        .route("/assets/:file", get(asset_file))
        .route("/api/health", get(api_health))
        .route("/api/config", get(api_get_config).put(api_update_config))
        .route("/api/sessions", get(api_sessions))
        .route("/api/history", get(api_history))
        .route("/api/send", post(api_send))
        .route("/api/send_stream", post(api_send_stream))
        .route("/api/stream", get(api_stream))
        .route("/api/reset", post(api_reset))
        .with_state(web_state);

    let addr = format!("{}:{}", state.config.web_host, state.config.web_port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(listener) => listener,
        Err(e) => {
            error!("Failed to bind web server at {}: {}", addr, e);
            return;
        }
    };

    info!("Web UI available at http://{addr}");
    if let Err(e) = axum::serve(listener, router).await {
        error!("Web server error: {e}");
    }
}

async fn asset_file(Path(file): Path<String>) -> impl IntoResponse {
    let clean = file.replace("..", "");
    match WEB_ASSETS.get_file(format!("assets/{clean}")) {
        Some(file) => {
            let content_type = if clean.ends_with(".css") {
                "text/css; charset=utf-8"
            } else if clean.ends_with(".js") {
                "application/javascript; charset=utf-8"
            } else {
                "application/octet-stream"
            };
            ([("content-type", content_type)], file.contents().to_vec()).into_response()
        }
        None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
    }
}
