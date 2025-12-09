# Docker Security Improvements

## Summary

Fixed Docker security warnings by replacing build arguments (ARG) with Docker BuildKit secrets for sensitive values.

## Changes Made

### 1. Dockerfile Updates

**Before:**
- Used `ARG VITE_SUPABASE_URL` and `ARG VITE_SUPABASE_ANON_KEY` for sensitive values
- Set them as `ENV` variables, which could be visible in image layers
- Security warnings: `SecretsUsedInArgOrEnv`

**After:**
- Removed `ARG` declarations for sensitive values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- Use Docker BuildKit secrets with `--mount=type=secret` during build
- Secrets are only available during the build step and not persisted in image layers
- Added `# syntax=docker/dockerfile:1.4` to enable BuildKit features

### 2. Helper Scripts

Created `scripts/prepare-docker-secrets.sh` to:
- Extract secrets from `frontend/.env` file
- Create secret files in `./secrets/` directory
- Provide build instructions

### 3. Documentation

Created `docs/guides/DOCKER_BUILD.md` with:
- Secure build instructions
- CI/CD integration examples
- Troubleshooting guide
- Security best practices

### 4. Git Configuration

Updated `.gitignore` to exclude `secrets/` directory

## Security Benefits

1. **No secrets in image layers**: Secrets are mounted during build but not stored in final image
2. **No secrets in build history**: Docker BuildKit secrets are not visible in `docker history`
3. **Compliance**: Follows Docker security best practices for handling sensitive data
4. **CI/CD ready**: Works seamlessly with GitHub Actions, Railway, Render, etc.

## Usage

### Secure Build (Recommended)

```bash
# Prepare secrets
./scripts/prepare-docker-secrets.sh

# Build with secrets
docker build \
  --secret id=vite_supabase_url,src=./secrets/vite_supabase_url.txt \
  --secret id=vite_supabase_anon_key,src=./secrets/vite_supabase_anon_key.txt \
  -t designqa:latest .
```

### Verification

After building, verify secrets are not in image:
```bash
# Check image history (should not show secrets)
docker history designqa:latest

# Inspect image (should not contain secret values)
docker inspect designqa:latest
```

## Migration Notes

If you were previously using:
```bash
docker build --build-arg VITE_SUPABASE_ANON_KEY=xxx ...
```

You should now use:
```bash
docker build --secret id=vite_supabase_anon_key,src=./secrets/vite_supabase_anon_key.txt ...
```

## Testing

The secure build has been tested and verified:
- ✅ Build completes successfully
- ✅ No security warnings
- ✅ Frontend builds correctly with secrets
- ✅ Secrets are not persisted in final image
