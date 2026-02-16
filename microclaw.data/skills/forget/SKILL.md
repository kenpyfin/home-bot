---
name: forget
description: Sanitize conversation history by removing messages that contain specified keywords ("partial forgetting" of sensitive topics without losing the whole thread). Use only when the user explicitly asks to forget or remove certain content from history.
license: MIT
compatibility:
  os: [darwin, linux, windows]
  deps: []
---

# Forget (sanitize history)

Use this skill only when the user explicitly asks to remove or "forget" specific content from the conversation history (e.g. by keyword). Do not use proactively.

## Credentials

None. Chat ID and keywords are passed as arguments.

## Invoke (bash)

From the workspace root:

```bash
cd microclaw.data/skills/forget && python3 forget_tool.py "<chat_id>" "<keyword1>" "[keyword2]" ...
```

Optional: set `RUNTIME_GROUPS_BASE` in this skill's `.env` if runtime groups live elsewhere.

## Outputs

JSON summary of removed messages.

## High impact

**Yes.** Always confirm with the user before removing any history (chat_id, keywords, and that they understand messages containing those keywords will be removed).
