---
name: notion
description: Interact with Notion via the Notion API. Search pages/databases, get page/block content, append blocks, query databases. Use when the user asks to read or update Notion.
license: MIT
compatibility:
  os: [darwin, linux, windows]
  deps: []
---

# Notion

Use this skill when the user wants to search or edit Notion pages, databases, or blocks.

## Credentials

**Store credentials in this skill folder** so all personas can use the tool. Create `microclaw.data/skills/notion/.env` (or put NOTION_TOKEN in a .env file in this folder) with:

- `NOTION_TOKEN` — Notion integration token (create at https://www.notion.so/my-integrations).

Run from the skill directory so the script finds this folder's `.env`.

## Invoke (bash)

From the workspace root:

```bash
cd microclaw.data/skills/notion && python3 notion_tool.py <command> [args]
```

Commands: `search [query]`, `get_page <page_id>`, `get_blocks <block_id>`, `append <block_id> "text"`, `query_db <database_id>`.

## Outputs

JSON to stdout.

## High impact

No. Use for read/write as requested.
