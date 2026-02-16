# RapidAPI Skill

A flexible skill for calling any RapidAPI endpoint, with built-in support for social media scrapers and data APIs.

## 🚀 Quick Start

### 1. Get a RapidAPI Key

1. Sign up at [RapidAPI.com](https://rapidapi.com/)
2. Find an API you want to use (e.g., LinkedIn scraper, Instagram API)
3. Subscribe to the API (many have free tiers)
4. Copy your API key from the API's page

### 2. Configure the Skill

Create a `.env` file in this directory:

```bash
cd /Users/kenli/home-bot/microclaw.data/skills/rapidapi
cp .env.example .env
nano .env  # or use any text editor
```

Add your API key(s):

```env
# Default key
RAPIDAPI_KEY=your_actual_key_here

# Optional: separate keys for different services
RAPIDAPI_KEY_LINKEDIN=another_key_here
RAPIDAPI_KEY_INSTAGRAM=yet_another_key
```

### 3. Use the Skill

Once configured, just activate the skill when needed:

```
"Use the rapidapi skill to fetch LinkedIn organization posts"
```

## 📚 Usage Examples

### List configured keys
```bash
python3 rapidapi_tool.py list-keys
```

### Call an API endpoint
```bash
# Basic GET request
python3 rapidapi_tool.py call \
  linkedin-data-api.p.rapidapi.com \
  /v1/organization-posts \
  --params organization_id=123456

# With specific API key
python3 rapidapi_tool.py call \
  instagram-scraper-api2.p.rapidapi.com \
  /v1/user_posts \
  --params username=someuser \
  --key-name instagram

# POST request with body
python3 rapidapi_tool.py call \
  some-api.p.rapidapi.com \
  /v1/process \
  --method POST \
  --body '{"data": "value"}'
```

## 🔍 Popular Social Media APIs on RapidAPI

### LinkedIn
- `linkedin-data-api.p.rapidapi.com`
- `linkedin-data-scraper.p.rapidapi.com`
- `fresh-linkedin-profile-data.p.rapidapi.com`

### Instagram  
- `instagram-scraper-api2.p.rapidapi.com`
- `instagram-data1.p.rapidapi.com`
- `instagram-bulk-profile-scrapper.p.rapidapi.com`

### Twitter/X
- `twitter-api45.p.rapidapi.com`
- `twitter154.p.rapidapi.com`
- `twitter-v2.p.rapidapi.com`

### TikTok
- `tiktok-scraper7.p.rapidapi.com`
- `tiktok-download-without-watermark.p.rapidapi.com`

## 📋 Response Format

All API calls return JSON with:

```json
{
  "status_code": 200,
  "success": true,
  "data": { ... },
  "url": "https://...",
  "method": "GET"
}
```

Or on error:

```json
{
  "error": "Error message",
  "url": "https://...",
  "method": "GET"
}
```

## 🔒 Security

- Never commit your `.env` file to git
- Keep your API keys private
- Use separate keys for different APIs if billing is a concern
- Monitor your RapidAPI usage dashboard

## 💡 Tips

1. **Free Tiers**: Most APIs have free tiers (e.g., 100-1000 requests/month)
2. **Rate Limits**: Check each API's rate limits on RapidAPI
3. **API Docs**: Click "Endpoints" on any RapidAPI page to see available endpoints and parameters
4. **Multiple Keys**: Use different key names (e.g., `RAPIDAPI_KEY_LINKEDIN`) if you need separate billing or rate limits

## 🛠️ Troubleshooting

**"No API keys configured"**
- Create a `.env` file in this directory with `RAPIDAPI_KEY=your_key`

**"API key 'linkedin' not found"**
- Make sure you have `RAPIDAPI_KEY_LINKEDIN=...` in your `.env` file
- Or use `--key-name default` to use the default key

**403 or 401 errors**
- Check that your API key is correct
- Verify you've subscribed to the API on RapidAPI
- Check if you've exceeded your plan's rate limit

**Empty or unexpected response**
- Verify the API host and endpoint are correct
- Check the API documentation for required parameters
- Some APIs return different structures - check the `data` field in the response
