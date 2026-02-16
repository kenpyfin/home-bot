---
name: check-email
description: Fetch recent inbox messages via IMAP (subjects, senders, dates, snippets). Use when the user asks to check or read their email inbox.
license: MIT
compatibility:
  os: [darwin, linux, windows]
  deps: []
---

# Check email (IMAP)

Use this skill to fetch recent inbox messages (Gmail or other IMAP).

## Credentials

**Store credentials in this skill folder** so all personas can use the tool. Create `microclaw.data/skills/check-email/.env` (or a config file in this folder) with:

- `EMAIL_ADDRESS`, `EMAIL_PASSWORD`; optional `IMAP_SERVER`, `EMAIL_FETCH_LIMIT`. Copy from `.env.example` or from `shared/.env` into this folder's `.env`. Run from the skill directory so the script finds it.

## Invoke (bash)

From the workspace root:

```bash
cd microclaw.data/skills/check-email && python3 check_email_tool.py [search "query"] [limit]
```

Or with args: `check_email_tool.py <email> <password> [server] [limit] [search_query]`. Optional: `server` (default imap.gmail.com), `limit` (default 5).

## Outputs

JSON object with a list of email summaries.

## High impact

No.
