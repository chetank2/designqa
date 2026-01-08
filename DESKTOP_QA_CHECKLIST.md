# Desktop App QA Checklist

## Pre-Installation
- [ ] Quit any running instances of DesignQA
- [ ] Delete old app from `/Applications` (macOS) or `Program Files` (Windows)
- [ ] Install new DMG/EXE from build directory

## Backend Reachability & MCP Status

### Initial Launch
- [ ] App launches without errors
- [ ] No console errors for `/health` or `/api/health` endpoints
- [ ] Backend status indicator shows "Online" (green dot)
- [ ] MCP status shows "MCP connected" (green dot) in header
- [ ] Settings page shows backend reachable: `true`

### MCP Status Verification
- [ ] Navigate to Settings → Overview tab
- [ ] Verify "Figma Desktop Status" section shows:
  - [ ] MCP status: "MCP connected" (green)
  - [ ] Port: `3845` (or configured port)
  - [ ] Figma running: `Yes` (if Figma Desktop is open)
  - [ ] Last checked: Recent timestamp
- [ ] Click "Refresh status" button - status updates correctly

### Backend Health Check
- [ ] Open DevTools (Cmd+Option+I / Ctrl+Shift+I)
- [ ] Check Network tab for `/api/health` requests
- [ ] Verify requests return `200 OK` with `success: true`
- [ ] No `ERR_CONNECTION_REFUSED` or `ERR_FILE_NOT_FOUND` errors

## Local Mode Functionality

### Credentials Management
- [ ] Navigate to Settings → Credentials tab
- [ ] Can add new credentials (if backend reachable)
- [ ] Can view saved credentials list
- [ ] Can decrypt and use saved credentials

### Design Systems
- [ ] Navigate to Settings → Design Systems tab
- [ ] Can create new design system
- [ ] Can view existing design systems
- [ ] Can edit/delete design systems

### Reports & Output
- [ ] Navigate to Settings → Overview → "View Reports"
- [ ] Reports page loads correctly
- [ ] Can view generated comparison reports
- [ ] Screenshots/images load correctly

## API Endpoints Verification

### Browser Stats
- [ ] Open DevTools → Network tab
- [ ] Navigate to any page that triggers API calls
- [ ] Verify `/api/browser/stats` endpoint exists (can test manually)
- [ ] Check no 404 errors for API endpoints

### Common Endpoints
- [ ] `/api/health` - Returns 200 OK
- [ ] `/api/mcp/status` - Returns MCP connection status
- [ ] `/api/credentials` - Returns credentials list (if any)
- [ ] `/api/design-systems` - Returns design systems list

## Console Error Check
- [ ] Open DevTools → Console tab
- [ ] Verify NO errors for:
  - [ ] `127.0.0.1:7242/ingest` (should be removed)
  - [ ] `logo.svg` 404 errors (should use `./logo.svg` or `./favicon.ico`)
  - [ ] `/health` endpoint (should use `/api/health`)
  - [ ] Connection refused errors (backend should be running)

## Visual Verification
- [ ] Logo displays correctly in sidebar (no broken image icon)
- [ ] Favicon displays in browser tab
- [ ] All UI components render correctly
- [ ] No layout issues or missing assets

## Quick Test Scenarios

### Scenario 1: Fresh Install
1. Install app from DMG/EXE
2. Launch app
3. Verify backend starts automatically
4. Check MCP status shows "connected"
5. Navigate through all main pages (Compare, Reports, Settings)

### Scenario 2: MCP Connection
1. Ensure Figma Desktop is running
2. Launch DesignQA app
3. Verify MCP status shows "connected"
4. Try a comparison (if credentials configured)
5. Verify extraction works

### Scenario 3: Backend Restart
1. Stop embedded backend (if possible)
2. Verify UI shows "Backend unreachable"
3. Restart backend
4. Verify UI updates to "Backend reachable"
5. MCP status should update accordingly

## Known Issues to Watch For
- [ ] MCP shows "unavailable" when backend is healthy → Check `/api/health` vs `/health`
- [ ] Logo.svg 404 errors → Verify paths are relative (`./logo.svg`)
- [ ] Ingest call errors → Verify all `127.0.0.1:7242/ingest` calls removed
- [ ] Backend not starting → Check port 3847 availability

## Success Criteria
✅ Backend reachability works correctly  
✅ MCP status shows "connected" when Figma Desktop is running  
✅ No console errors for removed endpoints  
✅ All assets load correctly  
✅ API endpoints respond correctly  
