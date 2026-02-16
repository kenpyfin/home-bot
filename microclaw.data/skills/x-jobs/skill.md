---
name: x-jobs
description: Search for job listings posted on X (Twitter) via Twitter303 RapidAPI. Filter by keyword, location type, seniority, employment type, company. Use when the user asks for job search on X/Twitter.
license: MIT
compatibility:
  os: [darwin, linux, windows]
  deps: []
---

# X (Twitter) jobs search

Use this skill to search job listings on X (Twitter) using the Twitter303 RapidAPI.

## Credentials

**Store credentials in this skill folder** so all personas can use the tool. Create `microclaw.data/skills/x-jobs/.env` with:

- `RAPIDAPI_KEY` — your RapidAPI key for the Twitter303 (or relevant) API.

Run from the skill directory so the script finds this folder's `.env`.

## Invoke (bash)

From the workspace root:

```bash
cd microclaw.data/skills/x-jobs && python3 x_jobs_tool.py search --keyword "<keyword>" [--location-type <types>] [--seniority <levels>] [--employment <types>] [--company <name>] [--format json|pretty]
```

Optional: `--location-type` (default remote,onsite,hybrid), `--seniority`, `--employment`, `--company`, `--cursor` (pagination), `--format` (json|pretty).

## Outputs

JSON with job listings (title, company, location, salary, URL, Twitter handle). Pretty format prints human-readable list.

## High impact

No.
