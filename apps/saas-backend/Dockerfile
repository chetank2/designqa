# Multi-stage build for Railway/Render deployment
# syntax=docker/dockerfile:1.4
FROM node:20-slim AS builder

# Build arguments for Vite environment variables
# For Render: Pass these as build args (--build-arg VITE_SUPABASE_URL=...)
# For local/CI: Use Docker secrets instead (more secure)
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_SERVER_PORT
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Set environment to skip Chromium download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV DEBIAN_FRONTEND=noninteractive
ENV SKIP_ELECTRON_POSTINSTALL=true
ENV DOCKER_BUILD=true

# Set non-sensitive Vite build-time environment variables from build args
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_SERVER_PORT=${VITE_SERVER_PORT}
# Note: Sensitive values (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are handled in RUN command
# to support both BuildKit secrets (preferred) and ARG fallback (for Render)

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

# Copy workspace files for pnpm
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml* ./
COPY apps/saas-frontend/package.json ./apps/saas-frontend/
COPY apps/saas-backend/package.json ./apps/saas-backend/
COPY packages/compare-engine/package.json ./packages/compare-engine/

# Install pnpm and workspace dependencies (including frontend for build)
RUN npm install -g pnpm && \
    echo "Installing workspace dependencies..." && \
    pnpm install --frozen-lockfile && \
    echo "Dependencies installed successfully"

# Build compare-engine workspace package
COPY packages/compare-engine ./packages/compare-engine
RUN cd packages/compare-engine && pnpm run build

# Copy frontend source files needed for build
COPY apps/saas-frontend/src ./apps/saas-frontend/src
COPY apps/saas-frontend/index.html ./apps/saas-frontend/index.html
COPY apps/saas-frontend/vite.config.ts ./apps/saas-frontend/vite.config.ts
COPY apps/saas-frontend/tsconfig.json ./apps/saas-frontend/tsconfig.json
COPY apps/saas-frontend/tsconfig.node.json ./apps/saas-frontend/tsconfig.node.json
COPY apps/saas-frontend/tailwind.config.js ./apps/saas-frontend/tailwind.config.js
COPY apps/saas-frontend/postcss.config.js ./apps/saas-frontend/postcss.config.js
COPY apps/saas-frontend/components.json ./apps/saas-frontend/components.json
RUN mkdir -p ./apps/saas-frontend/public

# Build frontend with flexible secret handling
RUN --mount=type=secret,id=vite_supabase_url,required=false \
    --mount=type=secret,id=vite_supabase_anon_key,required=false \
    echo "Building frontend..." && \
    cd apps/saas-frontend && \
    touch .env && \
    if [ -f /run/secrets/vite_supabase_url ]; then \
        echo "Using BuildKit secret for VITE_SUPABASE_URL" && \
        echo "VITE_SUPABASE_URL=$(cat /run/secrets/vite_supabase_url)" >> .env && \
        export VITE_SUPABASE_URL="$(cat /run/secrets/vite_supabase_url)"; \
    elif [ -n "${VITE_SUPABASE_URL:-}" ]; then \
        echo "Using ARG/env var for VITE_SUPABASE_URL" && \
        echo "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}" >> .env && \
        export VITE_SUPABASE_URL="${VITE_SUPABASE_URL}"; \
    fi && \
    if [ -f /run/secrets/vite_supabase_anon_key ]; then \
        echo "Using BuildKit secret for VITE_SUPABASE_ANON_KEY" && \
        echo "VITE_SUPABASE_ANON_KEY=$(cat /run/secrets/vite_supabase_anon_key)" >> .env && \
        export VITE_SUPABASE_ANON_KEY="$(cat /run/secrets/vite_supabase_anon_key)"; \
    elif [ -n "${VITE_SUPABASE_ANON_KEY:-}" ]; then \
        echo "Using ARG/env var for VITE_SUPABASE_ANON_KEY" && \
        echo "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" >> .env && \
        export VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY}"; \
    fi && \
    rm -rf dist && \
    pnpm run build && \
    rm -f .env && \
    cd ../.. && \
    echo "Frontend build completed successfully" && \
    mkdir -p ./frontend && \
    echo "Created frontend directory" && \
    mv apps/saas-frontend/dist ./frontend/dist

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

# Copy root workspace files
COPY package.json pnpm-workspace.yaml ./

# Copy production-ready node_modules from builder stage (root modules)
COPY --from=builder /app/node_modules ./node_modules

# Copy backend source files preserving structure
COPY apps/saas-backend ./apps/saas-backend

# Copy backend node_modules from builder (contains symlinks to root)
COPY --from=builder /app/apps/saas-backend/node_modules ./apps/saas-backend/node_modules

# Copy workspace packages (needed for dependencies like compare-engine)
COPY --from=builder /app/packages/compare-engine ./packages/compare-engine

# Ensure config.json exists
RUN cp ./apps/saas-backend/config.example.json ./apps/saas-backend/config.json

# Copy built frontend from builder stage to where backend expects it
# backend server.js expects 'frontend/dist' in cwd
COPY --from=builder /app/frontend/dist ./apps/saas-backend/frontend/dist

# Set working directory to backend app
WORKDIR /app/apps/saas-backend

# Validate imports/exports before starting (catch import errors early)
RUN npm run validate || (echo "❌ Import/export validation failed!" && exit 1)

# Expose port (Railway will override PORT env var, but we expose default)
EXPOSE 3847

# Start server
CMD ["npm", "start"]
