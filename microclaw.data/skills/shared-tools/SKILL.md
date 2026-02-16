---
name: shared-tools
description: Migrated runtime tools (formerly in shared/TOOLS.md) are now individual skills. Use activate_skill for notion, send-email, query-vault, index-vault, check-email, forget, x-jobs. Any new tool MUST be created as a skill with credentials in the skill folder.
license: MIT
compatibility:
  os: [darwin, linux, windows]
  deps: []
---

# Shared tools (migrated to skills)

Runtime tools that used to live only in shared/ and shared/TOOLS.md have been **migrated to skills**. Use the skills catalog and **activate_skill** for the right skill instead of invoking shared scripts ad hoc.

## Migrated skills

- **notion** — Notion API (search, get page/blocks, append, query_db). Credentials in `microclaw.data/skills/notion/.env`.
- **send-email** — Send email via SMTP. Credentials in `microclaw.data/skills/send-email/.env`. High impact; confirm before sending.
- **query-vault** — Semantic search over ORIGIN Obsidian vault. Config/credentials in skill folder if needed.
- **index-vault** — Index vault for vector search. Run after editing vault notes.
- **check-email** — IMAP inbox fetch. Credentials in `microclaw.data/skills/check-email/.env`.
- **forget** — Sanitize conversation history by keyword. High impact; confirm with user.
- **x-jobs** — X (Twitter) job search via RapidAPI. Credentials in `microclaw.data/skills/x-jobs/.env`.

## Rule for new tools

**You MUST create any new tool as a skill.** Do not add on-demand tools only in shared/ or only in TOOLS.md.

1. Create `microclaw.data/skills/<tool_name>/SKILL.md` with description, when to use, and how to invoke (bash command).
2. **Put all credentials and config for that tool in the skill folder** (e.g. `.env` or config file there) so all personas can use it.
3. Optionally put the script in the skill folder or reference shared/ from the SKILL.

This keeps credentials in one place per tool and visible to every persona.
