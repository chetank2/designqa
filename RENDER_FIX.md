# Render 520 Error Fix

## Problem
Render deployment was failing with 520 error because the Dockerfile was using BuildKit secrets which Render doesn't support the same way.

## Solution
Updated Dockerfile to support multiple methods:
1. **BuildKit secrets** (preferred for local/CI) - Most secure
2. **ARG build arguments** (for Render) - Works with Render's build system
3. **Environment variables** (Render sets these during build) - Vite reads VITE_* from process.env

## Render Configuration Required

For Render to build successfully, ensure these environment variables are set in your Render dashboard:

1. Go to your Render service → **Environment** tab
2. Add these as **Environment Variables** (they'll be available during build):
   - `VITE_SUPABASE_URL` = `https://xxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `your_anon_key`

**Important**: These must be set as environment variables in Render. The Dockerfile will:
- Use BuildKit secrets if provided (local builds)
- Use ARG values if passed as build args
- Use environment variables (Render automatically makes these available during build)

## How It Works

The Dockerfile now checks for values in this order:
1. BuildKit secrets (`/run/secrets/...`) - Most secure
2. ARG values (`$VITE_SUPABASE_URL`, `$VITE_SUPABASE_ANON_KEY`)
3. Environment variables (Render sets these)

Vite automatically reads `VITE_*` variables from `process.env` during build, so as long as Render sets these as environment variables during the build, they'll be available.

## Next Steps

1. ✅ Dockerfile updated and pushed
2. ⏳ Render will automatically redeploy
3. ⏳ Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Render dashboard
4. ⏳ Check Render build logs to confirm build succeeds

## Verification

After Render redeploys, check:
- Build logs show "Frontend build completed successfully"
- No 520 errors
- Application loads correctly
