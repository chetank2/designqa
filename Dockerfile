# Multi-stage build for Railway deployment
# syntax=docker/dockerfile:1.4
FROM node:20-slim AS builder

# Build arguments for non-sensitive Vite environment variables
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_SERVER_PORT

# Set environment to skip Chromium download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV DEBIAN_FRONTEND=noninteractive
ENV SKIP_ELECTRON_POSTINSTALL=true
ENV DOCKER_BUILD=true

# Set non-sensitive Vite build-time environment variables from build args
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_SERVER_PORT=${VITE_SERVER_PORT}

# Install only essential build dependencies (no Chromium)
# Include xz-utils for lzma-native native module compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    xz-utils \
    liblzma-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies immediately (before copying large source files)
# This runs right after copying package files to avoid timeout
# Using explicit echo to verify execution and prevent caching issues
# Postinstall script will skip electron-builder due to DOCKER_BUILD=true
RUN echo "Installing root dependencies..." && \
    npm ci --include=dev && \
    echo "Installing frontend dependencies..." && \
    cd frontend && \
    npm ci --include=dev && \
    cd .. && \
    echo "Dependencies installed successfully"

# Copy only frontend source files needed for build (minimal copy)
COPY frontend/src ./frontend/src
COPY frontend/index.html ./frontend/index.html
COPY frontend/vite.config.ts ./frontend/vite.config.ts
COPY frontend/tsconfig.json ./frontend/tsconfig.json
COPY frontend/tsconfig.node.json ./frontend/tsconfig.node.json
COPY frontend/tailwind.config.js ./frontend/tailwind.config.js
COPY frontend/postcss.config.js ./frontend/postcss.config.js
COPY frontend/components.json ./frontend/components.json
# Create empty public directory if it doesn't exist (Vite handles this gracefully)
RUN mkdir -p ./frontend/public

# Build frontend with secure secret handling
# Secrets are mounted securely and not persisted in image layers
# Usage: docker build --secret id=vite_supabase_url,src=./secrets/vite_supabase_url.txt --secret id=vite_supabase_anon_key,src=./secrets/vite_supabase_anon_key.txt
# For local development, you can create secrets files or use build args (less secure but acceptable for local)
RUN --mount=type=secret,id=vite_supabase_url,required=false \
    --mount=type=secret,id=vite_supabase_anon_key,required=false \
    echo "Building frontend..." && \
    cd frontend && \
    # Create .env file from secrets (secrets are not persisted in image layers)
    touch .env && \
    if [ -f /run/secrets/vite_supabase_url ]; then \
        echo "VITE_SUPABASE_URL=$(cat /run/secrets/vite_supabase_url)" >> .env; \
    fi && \
    if [ -f /run/secrets/vite_supabase_anon_key ]; then \
        echo "VITE_SUPABASE_ANON_KEY=$(cat /run/secrets/vite_supabase_anon_key)" >> .env; \
    fi && \
    # Build with environment variables (secrets are only available during this RUN command)
    npm run build && \
    # Explicitly remove .env file to ensure no secrets persist (defense in depth)
    rm -f .env && \
    cd .. && \
    echo "Frontend build completed successfully"

# Copy server source files (only what's needed for production)
COPY server.js ./
COPY src ./src
COPY scripts ./scripts
COPY config.example.json ./config.json

# Remove dev dependencies before exporting artifacts to production stage
RUN npm prune --omit=dev && \
    npm cache clean --force

# Production stage - Railway will use this as the final stage
FROM node:20-slim AS production

ENV NODE_ENV=production
# PORT is set by Railway automatically via environment variable
# Default PORT=3847 is set in server.js, Railway will override it
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install runtime dependencies (Chromium dependencies for Puppeteer if needed at runtime)
# Note: Chromium itself will be installed via Puppeteer if required, but we skip it during build
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxss1 \
    libgtk-3-0 \
    libxshmfence1 \
    libglu1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy production-ready node_modules from builder stage (already pruned)
COPY --from=builder /app/node_modules ./node_modules

# Copy built frontend
COPY --from=builder /app/frontend/dist ./frontend/dist

# Copy server files
COPY server.js ./
COPY src ./src
COPY scripts ./scripts
COPY config.example.json ./config.json

# Set production environment
ENV NODE_ENV=production

# Expose port (Railway will override PORT env var, but we expose default)
EXPOSE 3847

# Start server - Railway requires this CMD to know the build is complete
CMD ["npm", "start"]
