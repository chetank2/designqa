# Figma OAuth Setup Guide

## Overview

The application uses **BYO-App (Bring Your Own App)** OAuth flow, meaning users provide their own Figma App credentials (Client ID and Client Secret) rather than using a shared application-wide configuration.

## ✅ Frontend Build Status

```bash
✅ Frontend built successfully
   • Output: apps/saas-frontend/dist/
   • Assets: 5 files generated
   • Ready for deployment
```

## 🔐 OAuth Configuration

### Step 1: Create a Figma App

1. Go to [Figma Developer Settings](https://www.figma.com/developers/apps)
2. Click **"Create a new app"**
3. Fill in app details:
   - **App Name**: Your app name (e.g., "DesignQA")
   - **Description**: Brief description
   - **App URL**: Your application URL (e.g., `https://yourdomain.com`)
4. Save the app

### Step 2: Configure OAuth Redirect URI

1. In your Figma App settings, find **"OAuth"** section
2. Add redirect URI:
   ```
   http://localhost:3847/api/auth/figma/callback
   ```
   For production:
   ```
   https://yourdomain.com/api/auth/figma/callback
   ```
3. Save the redirect URI

### Step 3: Get Client Credentials

1. In your Figma App settings, find **"OAuth"** section
2. Copy:
   - **Client ID** (e.g., `abc123xyz...`)
   - **Client Secret** (e.g., `figd_abc123...`)

### Step 4: Configure in Application

**Note**: The application uses **user-provided credentials** stored in the database, NOT environment variables.

1. Start the server:
   ```bash
   cd apps/saas-backend
   npm start
   ```

2. Open the frontend:
   ```
   http://localhost:3847
   ```

3. Navigate to **Settings → Figma Integration**

4. Enter your credentials:
   - **Client ID**: Your Figma App Client ID
   - **Client Secret**: Your Figma App Client Secret
   - Click **"Save Credentials"**

5. Click **"Connect to Figma"** to initiate OAuth flow

## 🔍 OAuth Routes Verification

### Available Routes

| Route | Method | Description | Auth Required |
|-------|--------|-------------|---------------|
| `/api/auth/figma/setup` | POST | Save Client ID/Secret | ✅ Yes |
| `/api/auth/figma/connect` | GET | Initiate OAuth flow | ✅ Yes |
| `/api/auth/figma/callback` | GET | Handle OAuth callback | ✅ Yes |
| `/api/auth/figma/status` | GET | Check connection status | ✅ Yes |

### Testing Routes

#### 1. Status Endpoint (No Auth)
```bash
curl http://localhost:3847/api/auth/figma/status
```
**Expected Response**:
```json
{
  "success": false,
  "connected": false,
  "timestamp": "2025-12-10T04:29:22.544Z"
}
```

#### 2. Setup Endpoint (Requires Auth)
```bash
curl -X POST http://localhost:3847/api/auth/figma/setup \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "clientId": "your_client_id",
    "clientSecret": "your_client_secret"
  }'
```
**Expected Response**:
```json
{
  "success": true,
  "message": "Credentials saved successfully"
}
```

#### 3. Connect Endpoint (Requires Auth)
```bash
curl http://localhost:3847/api/auth/figma/connect \
  -H "Cookie: your-session-cookie"
```
**Expected Response**:
```json
{
  "success": true,
  "url": "https://www.figma.com/oauth?client_id=...&redirect_uri=..."
}
```

#### 4. Callback Endpoint (Requires Auth + State)
This endpoint is called automatically by Figma after user authorization. It redirects to:
- Success: `/settings?figma_connected=true`
- Error: `/settings?figma_error=...`

## 🔄 OAuth Flow

```
1. User enters Client ID/Secret in Settings
   ↓
2. POST /api/auth/figma/setup
   ↓
3. User clicks "Connect to Figma"
   ↓
4. GET /api/auth/figma/connect
   → Returns authorization URL
   → Sets state cookie (CSRF protection)
   ↓
5. User redirected to Figma OAuth page
   ↓
6. User authorizes application
   ↓
7. Figma redirects to /api/auth/figma/callback?code=...&state=...
   ↓
8. Backend validates state (CSRF check)
   ↓
9. Backend exchanges code for tokens
   ↓
10. Tokens encrypted and stored in database
   ↓
11. User redirected to /settings?figma_connected=true
```

## 🔐 Security Features

1. **CSRF Protection**: State parameter validated on callback
2. **Encrypted Storage**: Tokens encrypted at rest (AES-256-GCM)
3. **Secure Cookies**: State cookie is httpOnly, secure in production
4. **Token Refresh**: Automatic refresh when tokens expire
5. **Backend-Only Tokens**: Tokens never exposed to frontend

## 📝 Environment Variables

**Note**: OAuth credentials are **NOT** stored in environment variables. They are:
- Entered by users in the UI
- Stored encrypted in the database
- Retrieved per-user when needed

However, you may want to set these for other purposes:

```bash
# Optional: For MCP Proxy (if using proxy mode)
FIGMA_CLIENT_ID=your_client_id
FIGMA_CLIENT_SECRET=your_client_secret

# Required: For token encryption
CREDENTIAL_ENCRYPTION_KEY=your-secure-encryption-key-here
```

## 🧪 Testing Checklist

- [ ] Frontend built successfully
- [ ] Server running on port 3847
- [ ] `/api/auth/figma/status` returns expected response
- [ ] Can access Settings → Figma Integration page
- [ ] OAuth Settings component is visible
- [ ] Can enter Client ID and Secret
- [ ] Can save credentials (requires authentication)
- [ ] Can initiate OAuth flow (requires authentication)
- [ ] OAuth callback redirects correctly
- [ ] Connection status shows "Connected" after OAuth

## 🚀 Next Steps

1. **Configure OAuth in UI**:
   - Open http://localhost:3847
   - Go to Settings → Figma Integration
   - Enter your Figma App credentials
   - Click "Save Credentials"

2. **Test OAuth Flow**:
   - Click "Connect to Figma"
   - Complete authorization in Figma
   - Verify redirect back to settings
   - Check connection status

3. **Test Connection Methods**:
   - Desktop MCP (if Figma Desktop app is running)
   - Proxy MCP (if proxy server is configured)
   - Remote MCP (using OAuth tokens)
   - Figma API (using Personal Access Token)

## 📚 Related Documentation

- [Figma OAuth Implementation Summary](./FIGMA_OAUTH_IMPLEMENTATION_SUMMARY.md)
- [Figma OAuth Test Results](./FIGMA_OAUTH_TEST_RESULTS.md)
- [Environment Setup Guide](./guides/ENVIRONMENT_SETUP.md)
