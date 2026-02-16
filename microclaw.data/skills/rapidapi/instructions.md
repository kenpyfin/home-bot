# RapidAPI Skill

This skill allows the agent to call RapidAPI endpoints for various services, including social media scrapers, data APIs, and more.

## Available Tools

- `python3 rapidapi_tool.py call <api_host> <endpoint> [--method GET|POST] [--params key=value ...]`: Call a RapidAPI endpoint
- `python3 rapidapi_tool.py list-keys`: List all configured API keys and their names

## Setup

The skill requires API keys stored in `.env` file in the skill directory:

```
RAPIDAPI_KEY=your_default_key_here
RAPIDAPI_KEY_LINKEDIN=specific_key_for_linkedin_api
RAPIDAPI_KEY_INSTAGRAM=specific_key_for_instagram_api
```

You can have multiple keys for different APIs. The tool will use `RAPIDAPI_KEY` as default, or you can specify a specific key with `--key-name linkedin` to use `RAPIDAPI_KEY_LINKEDIN`.

## Common RapidAPI Hosts for Social Media

- **LinkedIn**: `linkedin-data-api.p.rapidapi.com`, `linkedin-data-scraper.p.rapidapi.com`
- **Instagram**: `instagram-scraper-api2.p.rapidapi.com`, `instagram-data1.p.rapidapi.com`
- **Twitter/X**: `twitter-api45.p.rapidapi.com`, `twitter154.p.rapidapi.com`
- **TikTok**: `tiktok-scraper7.p.rapidapi.com`, `tiktok-data.p.rapidapi.com`

## Examples

```bash
# Get LinkedIn organization posts
python3 rapidapi_tool.py call linkedin-data-api.p.rapidapi.com /v1/organization-posts \
  --params organization_id=123456 --key-name linkedin

# Get Instagram user posts
python3 rapidapi_tool.py call instagram-scraper-api2.p.rapidapi.com /v1/user_posts \
  --params username=someuser --key-name instagram

# List all configured keys
python3 rapidapi_tool.py list-keys
```
