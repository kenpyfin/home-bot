---
name: send-email
description: Send email via SMTP (Gmail or other). Use when the user asks to send an email.
license: MIT
compatibility:
  os: [darwin, linux, windows]
  deps: []
---

# Send email

Use this skill when the user wants to send an email (Gmail, SMTP, etc.).

## Credentials

**Store credentials in this skill folder** so all personas can use the tool. Create `microclaw.data/skills/send-email/.env` with:

- `EMAIL_ADDRESS` — sender email
- `EMAIL_PASSWORD` — app password or account password

Run from the skill directory so the script finds this folder's `.env`.

## Invoke (bash)

From the workspace root:

```bash
cd microclaw.data/skills/send-email && python3 send_email_tool.py --to "<recipient>" --subject "<subject>" --body "<body>"
```

## Outputs

JSON with success/error to stdout.

## High impact

**Yes.** Always confirm with the user before sending (recipient, subject, body).
