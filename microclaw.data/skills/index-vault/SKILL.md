---
name: index-vault
description: Index the ORIGIN Obsidian vault markdown files into ChromaDB for vector search. Use after adding or editing vault notes so query-vault stays up to date.
license: MIT
compatibility:
  os: [darwin, linux]
  deps: []
---

# Index vault (ORIGIN)

Use this skill to reindex the vault so semantic search (query-vault) returns current content. Run after adding or editing vault notes.

## Credentials / environment

**Store any config in this skill folder** so all personas can use the tool. Same as query-vault: vector DB path and embedding server URL can be in this folder’s config or .env if needed.

## Invoke (bash)

From the workspace root (venv remains in shared/):

```bash
shared/.venv-vault/bin/python microclaw.data/skills/index-vault/index_vault.py
```

Run `shared/setup_vault_env.sh` once if the venv is missing.

## Outputs

Summary line to stdout.

## High impact

No.
