//! Orchestrator: plan-first architecture. Produces a plan for every user message before
//! the main agent loop. Simple plans → direct reply; complex plans → delegate to sub-agents.

use crate::claude::{Message, MessageContent, ResponseContentBlock};
use crate::config::Config;
use crate::error::MicroClawError;
use crate::llm;
use serde::{Deserialize, Serialize};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PlanStrategy {
    Direct,
    Delegate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub strategy: PlanStrategy,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub delegate_tasks: Option<Vec<String>>,
}

const ORCHESTRATOR_SYSTEM: &str = r#"You are an orchestrator. Given a user message, output a JSON plan and nothing else.

Output format (valid JSON only, no markdown or extra text):
{"strategy": "direct" | "delegate", "summary": "brief rationale", "delegate_tasks": ["task1", "task2"]}

Rules:
- Use "direct" for: simple greetings, quick questions, single-step requests, clarification, or when unsure.
- Use "delegate" for: multi-step research, parallel subtasks, clearly decomposable work (e.g. "research X and compare with Y").
- delegate_tasks: required when strategy is "delegate"; list clear, independent tasks. Omit or empty array when strategy is "direct".
- Prefer "direct" when unsure; avoid over-delegation."#;

/// Run the orchestrator to produce a plan for the user message.
/// Uses config.model unless config.orchestrator_model is set.
pub async fn run_orchestrator_plan(
    config: &Config,
    user_message: &str,
    recent_context: Option<&str>,
) -> Result<Plan, MicroClawError> {
    let mut llm_config = config.clone();
    if !config.orchestrator_model.trim().is_empty() {
        llm_config.model = config.orchestrator_model.trim().to_string();
    }

    let user_content = if let Some(ctx) = recent_context {
        format!("Recent context:\n{ctx}\n\nUser message: {user_message}")
    } else {
        user_message.to_string()
    };

    let messages = vec![Message {
        role: "user".into(),
        content: MessageContent::Text(user_content),
    }];

    let provider = llm::create_provider(&llm_config);
    let response = provider
        .send_message(ORCHESTRATOR_SYSTEM, messages, None)
        .await?;

    let text: String = response
        .content
        .iter()
        .filter_map(|block| match block {
            ResponseContentBlock::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("");

    let plan = parse_plan(&text)?;
    info!(
        "Orchestrator plan: strategy={:?} summary={} delegate_tasks={:?}",
        plan.strategy,
        plan.summary,
        plan.delegate_tasks
    );
    Ok(plan)
}

fn parse_plan(text: &str) -> Result<Plan, MicroClawError> {
    let trimmed = text.trim();
    // Strip markdown code blocks if present
    let json_str = if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            &trimmed[start..=end]
        } else {
            trimmed
        }
    } else {
        trimmed
    };

    serde_json::from_str(json_str).map_err(|e| {
        MicroClawError::Config(format!(
            "Failed to parse orchestrator plan JSON: {e}. Raw: {}",
            json_str.chars().take(500).collect::<String>()
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_plan_direct() {
        let json = r#"{"strategy": "direct", "summary": "Simple greeting", "delegate_tasks": null}"#;
        let plan: Plan = serde_json::from_str(json).unwrap();
        assert_eq!(plan.strategy, PlanStrategy::Direct);
        assert_eq!(plan.summary, "Simple greeting");
        assert!(plan.delegate_tasks.is_none());
    }

    #[test]
    fn test_parse_plan_delegate() {
        let json = r#"{"strategy": "delegate", "summary": "Research task", "delegate_tasks": ["Research X", "Compare with Y"]}"#;
        let plan: Plan = serde_json::from_str(json).unwrap();
        assert_eq!(plan.strategy, PlanStrategy::Delegate);
        assert_eq!(plan.summary, "Research task");
        assert_eq!(
            plan.delegate_tasks.as_ref().unwrap(),
            &["Research X".to_string(), "Compare with Y".to_string()]
        );
    }

    #[test]
    fn test_parse_plan_wrapped_in_markdown() {
        let text = "```json\n{\"strategy\": \"direct\", \"summary\": \"ok\"}\n```";
        let plan = parse_plan(text).unwrap();
        assert_eq!(plan.strategy, PlanStrategy::Direct);
    }
}
