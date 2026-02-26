use std::sync::Arc;

use teloxide::prelude::*;
use teloxide::types::ParseMode;

use crate::channels::telegram::markdown_to_telegram_html;
use crate::db::{call_blocking, Database, StoredMessage};
use crate::tools::auth_context_from_input;

pub async fn is_web_chat(db: Arc<Database>, chat_id: i64) -> bool {
    matches!(
        call_blocking(db, move |d| d.get_chat_type(chat_id)).await,
        Ok(Some(ref t)) if t == "web"
    )
}

pub async fn enforce_channel_policy(
    db: Arc<Database>,
    input: &serde_json::Value,
    target_chat_id: i64,
) -> Result<(), String> {
    let Some(auth) = auth_context_from_input(input) else {
        return Ok(());
    };

    if is_web_chat(db, auth.caller_chat_id).await && auth.caller_chat_id != target_chat_id {
        return Err("Permission denied: web chats cannot operate on other chats".into());
    }

    Ok(())
}

pub async fn deliver_and_store_bot_message(
    bot: &Bot,
    db: Arc<Database>,
    bot_username: &str,
    chat_id: i64,
    persona_id: i64,
    text: &str,
) -> Result<(), String> {
    if is_web_chat(db.clone(), chat_id).await {
        let msg = StoredMessage {
            id: uuid::Uuid::new_v4().to_string(),
            chat_id,
            persona_id,
            sender_name: bot_username.to_string(),
            content: text.to_string(),
            is_from_bot: true,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
        call_blocking(db.clone(), move |d| d.store_message(&msg))
            .await
            .map_err(|e| format!("Failed to store web message: {e}"))
    } else {
        let formatted = markdown_to_telegram_html(text);
        let send_result = bot
            .send_message(ChatId(chat_id), &formatted)
            .parse_mode(ParseMode::Html)
            .await;
        let msg = StoredMessage {
            id: uuid::Uuid::new_v4().to_string(),
            chat_id,
            persona_id,
            sender_name: bot_username.to_string(),
            content: text.to_string(),
            is_from_bot: true,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
        match &send_result {
            Ok(_) => {}
            Err(e) => {
                let err_str = e.to_string();
                // Chat may have been deleted or bot removed; still store so conversation history is intact (e.g. web UI can show reply).
                if err_str.contains("chat not found")
                    || err_str.contains("Chat not found")
                    || err_str.contains("user is deactivated")
                {
                    tracing::warn!(
                        target: "channel",
                        chat_id = chat_id,
                        error = %err_str,
                        "Telegram delivery failed (chat unavailable); storing message anyway"
                    );
                    call_blocking(db.clone(), move |d| d.store_message(&msg))
                        .await
                        .map_err(|e| format!("Failed to store message: {e}"))?;
                    return Ok(());
                }
                return Err(format!("Failed to send message: {e}"));
            }
        }
        call_blocking(db.clone(), move |d| d.store_message(&msg))
            .await
            .map_err(|e| format!("Failed to store sent message: {e}"))
    }
}
