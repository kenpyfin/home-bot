# Multi-stage build for MicroClaw with agent-browser support
# Stage 1: Build microclaw binary (Rust) and web assets
FROM rust:1-bookworm AS builder

# Install Node.js for web build
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Build web assets first (required for cargo build - include_dir embeds web/dist)
COPY web/package.json web/package-lock.json* ./web/
RUN npm --prefix web ci
COPY web/ ./web/
RUN npm --prefix web run build

# Build Rust binary
COPY Cargo.toml Cargo.lock build.rs ./
COPY src/ ./src/
COPY builtin_skills/ ./builtin_skills/
COPY microclaw.data/ ./microclaw.data/
RUN cargo build --release

# Stage 2: Runtime with Playwright (Chromium) + agent-browser
FROM mcr.microsoft.com/playwright:v1.48.0-noble AS runtime

# Install Node.js (playwright image may have it; ensure npm for agent-browser)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install agent-browser globally
RUN npm install -g agent-browser && agent-browser install

# Copy microclaw binary from builder
COPY --from=builder /build/target/release/microclaw /usr/local/bin/microclaw

WORKDIR /app

# Default config path (override with volume)
ENV MICROCLAW_CONFIG=/app/microclaw.config.yaml

# Web UI port
EXPOSE 10961

# Chromium needs more shared memory; 1gb recommended
ENV NODE_OPTIONS="--max-old-space-size=512"

CMD ["microclaw", "start"]
