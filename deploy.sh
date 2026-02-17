#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '%s\n' "$*"
}

log "Deploying MicroClaw..."

# Optional: git pull if run from a clone
if [ -d .git ]; then
  log "Pulling latest changes..."
  git pull --rebase || true
fi

log "Building and starting containers..."
docker compose build --no-cache
docker compose up -d

log ""
log "MicroClaw deployed."
log "Web UI: http://localhost:10961"
