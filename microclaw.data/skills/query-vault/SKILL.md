---
name: query-vault
description: Semantic search over the ORIGIN Obsidian vault (ChromaDB). Use when the user asks to search the vault or find context in their notes.
license: MIT
compatibility:
  os: [darwin, linux]
  deps: []
---

# Query vault (ORIGIN)

Use this skill for semantic search over the Obsidian vault. Queries ChromaDB and returns matching note excerpts.

## Credentials / environment

**Store config in this skill folder.** Optional `.env`: `VAULT_DB_PATH`, `VAULT_EMBED_URL`. The script loads `.env` from this folder. Use the shared vault venv (chromadb, etc.) to run the script.

## Invoke (bash)

From the workspace root (venv remains in shared/):

```bash
shared/.venv-vault/bin/python microclaw.data/skills/query-vault/query_vault.py "<query>"
```

Run `shared/setup_vault_env.sh` once if the venv is missing.

## Outputs

Printed excerpts to stdout.

## High impact

No.
