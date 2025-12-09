# Root-level Dockerfile for compatibility
# This file delegates to the actual Dockerfile in apps/saas-backend
# For Render/Railway deployments, use apps/saas-backend/Dockerfile directly

# Multi-stage build for Railway/Render deployment
# syntax=docker/dockerfile:1.4
FROM node:20-slim AS builder

# Build arguments for Vite environment variables
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

# Install only essential build dependencies
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
COPY apps/saas-backend/package.json ./apps/saas-backend/
COPY packages/compare-engine/package.json ./packages/compare-engine/

# Install pnpm and workspace dependencies
RUN npm install -g pnpm && \
    echo "Installing workspace dependencies..." && \
    pnpm install --frozen-lockfile --filter @myapp/saas-backend... && \
    echo "Dependencies installed successfully"

# Copy pre-built frontend dist (built locally with pnpm)
COPY apps/saas-frontend/dist ./frontend/dist

# Copy backend source files
COPY apps/saas-backend/server.js ./server.js
COPY apps/saas-backend/src ./src
COPY apps/saas-backend/scripts ./scripts
COPY apps/saas-backend/config.example.json ./config.json

# Production stage
FROM node:20-slim AS production

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install runtime dependencies
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

# Copy backend package files and workspace structure
COPY apps/saas-backend/package*.json ./
COPY package.json ./
COPY pnpm-workspace.yaml ./

# Copy production-ready node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy built frontend from builder stage
COPY --from=builder /app/frontend/dist ./frontend/dist

# Copy server files from builder stage
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/config.json ./config.json

# Set production environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3847

# Start server
CMD ["npm", "start"]
