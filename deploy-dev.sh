#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '%s\n' "$*"
}

log "Deploying MicroClaw (dev: incremental build, no cache invalidation)..."

log "Building and starting containers..."
docker compose build
docker compose up -d

log ""
log "MicroClaw deployed."
log "Web UI: http://localhost:10961"
