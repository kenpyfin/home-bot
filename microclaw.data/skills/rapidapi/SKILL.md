---
name: rapidapi
description: Call RapidAPI endpoints for social media scrapers, data APIs, and more. Use when the user needs LinkedIn, Instagram, Twitter/X, or TikTok data from RapidAPI.
license: MIT
compatibility:
  os: [darwin, linux, windows]
  deps: []
---

# RapidAPI

Use this skill when the user wants to call RapidAPI endpoints (e.g. social media scrapers, data APIs).

## Credentials

**Store credentials in this skill folder** so all personas can use the tool. Create `microclaw.data/skills/rapidapi/.env` with:

- `RAPIDAPI_KEY` — default API key
- `RAPIDAPI_KEY_LINKEDIN`, `RAPIDAPI_KEY_INSTAGRAM`, etc. — optional named keys for specific APIs

Get keys from [RapidAPI.com](https://rapidapi.com/) after subscribing to an API.

## Invoke (bash)

From the workspace root:

```bash
cd microclaw.data/skills/rapidapi && python3 rapidapi_tool.py call <api_host> <endpoint> [--method GET|POST] [--params key=value ...] [--key-name default|linkedin|instagram|...]
```

List configured keys:

```bash
cd microclaw.data/skills/rapidapi && python3 rapidapi_tool.py list-keys
```

## Common hosts

- **LinkedIn**: `linkedin-data-api.p.rapidapi.com`, `linkedin-data-scraper.p.rapidapi.com`
- **Instagram**: `instagram-scraper-api2.p.rapidapi.com`, `instagram-data1.p.rapidapi.com`
- **Twitter/X**: `twitter-api45.p.rapidapi.com`, `twitter154.p.rapidapi.com`
- **TikTok**: `tiktok-scraper7.p.rapidapi.com`

## Outputs

JSON with `status_code`, `success`, `data`, or `error`. Check the API docs on RapidAPI for endpoint paths and parameters.
