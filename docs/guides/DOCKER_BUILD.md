# Docker Build Guide

This guide explains how to build the DesignQA Docker image securely using Docker BuildKit secrets.

## Security Improvements

The Dockerfile has been updated to use Docker BuildKit secrets instead of build arguments (ARG) for sensitive values like API keys. This prevents secrets from being stored in image layers or build history.

## Prerequisites

- Docker with BuildKit enabled (Docker 18.09+)
- BuildKit is enabled by default in Docker Desktop

## Building with Secrets (Recommended)

### Step 1: Prepare Secret Files

Use the helper script to create secret files from your `.env` file:

```bash
./scripts/prepare-docker-secrets.sh
```

This script reads values from `frontend/.env` and creates secret files in `./secrets/`.

Alternatively, create secret files manually:

```bash
mkdir -p secrets
echo "your-supabase-url" > secrets/vite_supabase_url.txt
echo "your-anon-key" > secrets/vite_supabase_anon_key.txt
```

### Step 2: Build with Secrets

```bash
docker build \
  --secret id=vite_supabase_url,src=./secrets/vite_supabase_url.txt \
  --secret id=vite_supabase_anon_key,src=./secrets/vite_supabase_anon_key.txt \
  --build-arg VITE_API_URL=http://localhost:3847 \
  --build-arg VITE_WS_URL=ws://localhost:3847 \
  --build-arg VITE_SERVER_PORT=3847 \
  -t designqa:latest .
```

### Step 3: Verify Build

Check that the image was created:

```bash
docker images designqa:latest
```

## Build Arguments

Non-sensitive build arguments (optional):

- `VITE_API_URL` - API URL (default: from .env or empty)
- `VITE_WS_URL` - WebSocket URL (default: from .env or empty)
- `VITE_SERVER_PORT` - Server port (default: from .env or empty)

## Running the Container

```bash
docker run -p 3847:3847 designqa:latest
```

Or with environment variables:

```bash
docker run -p 3847:3847 \
  -e PORT=3847 \
  -e SUPABASE_URL=your-url \
  -e SUPABASE_ANON_KEY=your-key \
  designqa:latest
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Build Docker image
  run: |
    docker build \
      --secret id=vite_supabase_url,env=VITE_SUPABASE_URL \
      --secret id=vite_supabase_anon_key,env=VITE_SUPABASE_ANON_KEY \
      -t designqa:latest .
  env:
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

### Railway / Render

These platforms typically handle secrets through their UI. The Dockerfile will work with their secret management systems.

## Security Notes

1. **Never commit secret files** - The `secrets/` directory is in `.gitignore`
2. **Secrets are not persisted** - Secrets are only available during the build step and are not stored in image layers
3. **Use secrets management** - In production, use your platform's secret management (e.g., Railway secrets, GitHub Secrets)
4. **Rotate keys regularly** - If secrets are ever exposed, rotate them immediately

## Troubleshooting

### Build fails with "secret not found"

Ensure secret files exist and paths are correct:
```bash
ls -la secrets/
```

### Frontend build fails with missing env vars

Check that secret files contain valid values:
```bash
cat secrets/vite_supabase_url.txt
cat secrets/vite_supabase_anon_key.txt
```

### Build warnings about secrets

If you see warnings about secrets in ARG/ENV, ensure you're using the `--secret` flag and not `--build-arg` for sensitive values.
