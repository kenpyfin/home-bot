use std::str::FromStr;
use std::sync::Arc;

use chrono::Utc;
use teloxide::prelude::*;
use tracing::{error, info};

use crate::telegram::AppState;

pub fn spawn_scheduler(state: Arc<AppState>) {
    tokio::spawn(async move {
        info!("Scheduler started");
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            run_due_tasks(&state).await;
        }
    });
}

async fn run_due_tasks(state: &Arc<AppState>) {
    let now = Utc::now().to_rfc3339();
    let tasks = match state.db.get_due_tasks(&now) {
        Ok(t) => t,
        Err(e) => {
            error!("Scheduler: failed to query due tasks: {e}");
            return;
        }
    };

    for task in tasks {
        info!(
            "Scheduler: executing task #{} for chat {}",
            task.id, task.chat_id
        );

        let started_at = Utc::now();
        let started_at_str = started_at.to_rfc3339();

        let chat_type = state
            .db
            .get_chat_type(task.chat_id)
            .ok()
            .flatten()
            .unwrap_or_else(|| "private".into());

        // Run agent loop with the task prompt
        let (success, result_summary) = match crate::telegram::process_with_agent(
            state,
            task.chat_id,
            "scheduler",
            "private",
            Some(&task.prompt),
            None,
        )
        .await
        {
            Ok(response) => {
                if !response.is_empty() {
                    if chat_type == "web" {
                        let bot_msg = crate::db::StoredMessage {
                            id: uuid::Uuid::new_v4().to_string(),
                            chat_id: task.chat_id,
                            sender_name: state.config.bot_username.clone(),
                            content: response.clone(),
                            is_from_bot: true,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        };
                        let _ = state.db.store_message(&bot_msg);
                    } else {
                        crate::telegram::send_response(&state.bot, ChatId(task.chat_id), &response)
                            .await;
                        let bot_msg = crate::db::StoredMessage {
                            id: uuid::Uuid::new_v4().to_string(),
                            chat_id: task.chat_id,
                            sender_name: state.config.bot_username.clone(),
                            content: response.clone(),
                            is_from_bot: true,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        };
                        let _ = state.db.store_message(&bot_msg);
                    }
                }
                let summary = if response.len() > 200 {
                    format!("{}...", &response[..response.floor_char_boundary(200)])
                } else {
                    response
                };
                (true, Some(summary))
            }
            Err(e) => {
                error!("Scheduler: task #{} failed: {e}", task.id);
                let err_text = format!("Scheduled task #{} failed: {e}", task.id);
                if chat_type == "web" {
                    let bot_msg = crate::db::StoredMessage {
                        id: uuid::Uuid::new_v4().to_string(),
                        chat_id: task.chat_id,
                        sender_name: state.config.bot_username.clone(),
                        content: err_text.clone(),
                        is_from_bot: true,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = state.db.store_message(&bot_msg);
                } else {
                    let _ = state
                        .bot
                        .send_message(ChatId(task.chat_id), &err_text)
                        .await;
                    let bot_msg = crate::db::StoredMessage {
                        id: uuid::Uuid::new_v4().to_string(),
                        chat_id: task.chat_id,
                        sender_name: state.config.bot_username.clone(),
                        content: err_text,
                        is_from_bot: true,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = state.db.store_message(&bot_msg);
                }
                (false, Some(format!("Error: {e}")))
            }
        };

        let finished_at = Utc::now();
        let finished_at_str = finished_at.to_rfc3339();
        let duration_ms = (finished_at - started_at).num_milliseconds();

        // Log the task run
        if let Err(e) = state.db.log_task_run(
            task.id,
            task.chat_id,
            &started_at_str,
            &finished_at_str,
            duration_ms,
            success,
            result_summary.as_deref(),
        ) {
            error!("Scheduler: failed to log task run for #{}: {e}", task.id);
        }

        // Compute next run
        let tz: chrono_tz::Tz = state.config.timezone.parse().unwrap_or(chrono_tz::Tz::UTC);
        let next_run = if task.schedule_type == "cron" {
            match cron::Schedule::from_str(&task.schedule_value) {
                Ok(schedule) => schedule.upcoming(tz).next().map(|t| t.to_rfc3339()),
                Err(e) => {
                    error!("Scheduler: invalid cron for task #{}: {e}", task.id);
                    None
                }
            }
        } else {
            None // one-shot
        };

        if let Err(e) =
            state
                .db
                .update_task_after_run(task.id, &started_at_str, next_run.as_deref())
        {
            error!("Scheduler: failed to update task #{}: {e}", task.id);
        }
    }
}
