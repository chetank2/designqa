# Figma OAuth Implementation Verification Checklist

## ✅ Implementation Complete

All components of the Figma OAuth 2.0 implementation have been completed.

## Backend Verification

### 1. Dependencies
- ✅ `cookie-parser` added to `package.json` (v1.4.6)
- ✅ Import added to `server/index.js`

### 2. Routes
- ✅ Auth routes registered at `/api/auth`
- ✅ Rate limiting applied (`healthLimiter`)
- ✅ Routes:
  - `POST /api/auth/figma/setup` - Save credentials
  - `GET /api/auth/figma/connect` - Initiate OAuth
  - `GET /api/auth/figma/callback` - Handle callback
  - `GET /api/auth/figma/status` - Check status

### 3. Security
- ✅ Cookie security: `httpOnly`, `secure` (production), `sameSite: 'lax'`
- ✅ CSRF protection: State parameter validation
- ✅ HTTPS enforcement middleware (production)
- ✅ Token redaction utility implemented
- ✅ Scope: Minimal `files:read` scope

### 4. Database
- ✅ Migration exists: `002_create_figma_credentials.sql`
- ✅ Table structure: `figma_credentials` with encrypted fields
- ✅ Adapter methods: `getFigmaCredentials`, `upsertFigmaCredentials`, `updateFigmaTokens`

### 5. Services
- ✅ `FigmaAuthService`:
  - `saveCredentials()` - Encrypts and stores Client ID/Secret
  - `generateAuthUrl()` - Creates OAuth URL with state
  - `exchangeCode()` - Exchanges code for tokens
  - `refreshAccessToken()` - Handles token refresh (fixed to handle missing data)
  - `getValidAccessToken()` - Returns valid token, auto-refreshes if needed
  - Scope saved correctly in `saveTokens()`

### 6. MCP Integration
- ✅ `mcp-config.js` updated to use OAuth tokens first
- ✅ Token provider function created
- ✅ Falls back to PAT if OAuth unavailable
- ✅ `RemoteMCPClient` enhanced with 401 handling and auto-retry

## Frontend Verification

### 7. API Methods
- ✅ `saveFigmaCredentials()` - POST `/api/auth/figma/setup`
- ✅ `connectFigma()` - GET `/api/auth/figma/connect`
- ✅ `getFigmaStatus()` - GET `/api/auth/figma/status`
- ✅ Exported from `api.ts`

### 8. UI Component
- ✅ `FigmaOAuthSettings.tsx` created with:
  - Client ID/Secret inputs (masked)
  - Save credentials button
  - Connect to Figma button
  - Status display
  - Setup instructions
  - Callback URL handling

### 9. Settings Integration
- ✅ Component imported in `Settings.tsx`
- ✅ Rendered in Figma Integration tab
- ✅ Shows alongside PAT option
- ✅ Callback URL params handled (`figma_connected`, `figma_error`)

## Testing Steps

### Manual Testing Required

1. **Install Dependencies**
   ```bash
   cd apps/saas-backend
   npm install
   ```

2. **Database Migration**
   - Verify migration runs on server startup
   - Check `figma_credentials` table exists

3. **Create Figma App**
   - Go to https://www.figma.com/developers/apps
   - Create new app
   - Add redirect URI: `https://<your-deployment-url>/api/auth/figma/callback`
   - Note Client ID and Client Secret

4. **Test OAuth Flow**
   - Navigate to Settings → Figma Integration
   - Enter Client ID and Secret
   - Click "Save Credentials"
   - Click "Connect to Figma"
   - Complete OAuth flow in Figma
   - Verify redirect back to Settings with success message
   - Check connection status shows "Connected"

5. **Test Token Usage**
   - Make a Figma API call (e.g., extract design)
   - Verify OAuth token is used (check logs - should show "oauth_or_pat" source)
   - Verify MCP connection works

6. **Test Token Refresh**
   - Wait for token to expire (or manually expire in DB)
   - Make another API call
   - Verify token is automatically refreshed
   - Check logs for refresh messages

7. **Test 401 Handling**
   - Simulate expired token
   - Make MCP request
   - Verify automatic refresh and retry
   - Verify error message if refresh fails

8. **Security Verification**
   - Check logs - verify tokens are redacted
   - Verify cookies are httpOnly in browser DevTools
   - Verify HTTPS redirect works in production
   - Test CSRF protection (try invalid state parameter)

## Known Issues

None identified. All implementation complete.

## Next Steps After Testing

1. Document Figma App creation process for users
2. Add error handling improvements based on testing
3. Consider adding token expiration warnings in UI
4. Monitor token refresh success rates
