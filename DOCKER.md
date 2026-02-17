# Docker Deployment

MicroClaw can run in Docker with agent-browser (headless Chromium) support.

## Quick Start

1. Copy and edit config:
   ```bash
   cp microclaw.config.example.yaml microclaw.config.yaml
   # Edit microclaw.config.yaml with your tokens, API keys, etc.
   ```

2. Ensure `workspace_dir` points to `./tmp` (or create the directory):
   ```bash
   mkdir -p tmp
   ```

3. Deploy:
   ```bash
   ./deploy.sh
   ```

4. Open Web UI: http://localhost:10961

## Config for Docker

When running in Docker, set these in `microclaw.config.yaml`:

- **workspace_dir**: `./tmp` (mounted as `/app/tmp` in container)
- **agent_browser_path**: `/usr/local/bin/agent-browser` (override host path like `/opt/homebrew/bin/agent-browser`)
- **web_host**: `0.0.0.0` (to accept connections from host)
- **web_auth_token**: Required when web_host is not localhost

## Volumes

- `./microclaw.config.yaml` → `/app/microclaw.config.yaml` (read-only)
- `./tmp` → `/app/tmp` (workspace: runtime, skills, shared, AGENTS.md)

## ORIGIN Vault

To use the ORIGIN Obsidian vault:

1. Configure `vault:` in `microclaw.config.yaml` (see microclaw.config.example.yaml)
2. Clone the vault into `tmp/shared/ORIGIN` or use the sync service
3. For scheduled git sync: create `.env` with `ORIGIN_VAULT_REPO=https://...` and run:
   ```bash
   docker compose --profile sync up -d
   ```

## Agent-Browser

The image includes agent-browser (npm) and Chromium (Playwright). Browser automation runs in headless mode only; no GUI. The `shm_size: "1gb"` setting is required for Chromium stability.

## Refresh / Update

To pull latest code and redeploy:

```bash
./deploy.sh
```

Or manually:

```bash
docker compose build --no-cache
docker compose up -d
```

## Sync ORIGIN Vault (Optional)

To sync the ORIGIN vault from git every 15 minutes:

1. Create `.env` with `ORIGIN_VAULT_REPO=https://github.com/your-org/ORIGIN.git`
2. Run: `docker compose --profile sync up -d`

The sync service pulls into `tmp/shared/ORIGIN`.
