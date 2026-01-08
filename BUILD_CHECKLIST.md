# DesignQA Build Checklist

This checklist ensures reliable builds for frontend, backend, and desktop applications.

## Pre-Build Verification

### 1. Environment Check
- [ ] Verify Node.js version: `node --version` (should be 18+ or 20+)
- [ ] Verify pnpm version: `pnpm --version` (should be 8+)
- [ ] Clean node_modules if issues: `rm -rf node_modules && pnpm install`
- [ ] Check workspace is healthy: `pnpm -r exec -- echo "OK"`

### 2. Dependencies Check
```bash
# Check all workspaces have dependencies
pnpm -r exec -- ls node_modules > /dev/null
```

### 3. Git Status
- [ ] Commit or stash any uncommitted changes
- [ ] Note current branch and commit hash for reference

## Frontend Build Process

### 1. Standard Web Build
```bash
cd apps/saas-frontend
CI=true npm run build
```
**Verification:**
- [ ] Check `apps/saas-frontend/dist/index.html` exists
- [ ] Verify assets use absolute paths (`/assets/...`) - correct for web
- [ ] Check main bundle size is reasonable (<1MB)

### 2. Electron-Specific Build
```bash
cd apps/saas-frontend
CI=true npm run build:electron
```
**Verification:**
- [ ] Check `apps/saas-frontend/dist/index.html` exists
- [ ] Verify assets use relative paths (`./assets/...`) - required for Electron
- [ ] Compare file sizes with web build (should be similar)

**Critical:** Always use `build:electron` for desktop apps, never `build`

## Backend Build Process

### 1. Backend Dependencies
```bash
cd apps/saas-backend
pnpm install
```
**Verification:**
- [ ] Check `apps/saas-backend/node_modules` exists
- [ ] Test server can start: `node src/core/server/index.js` (should bind to port)
- [ ] Stop test server before proceeding

### 2. Backend Configuration
- [ ] Verify `apps/saas-backend/package.json` has `"type": "module"`
- [ ] Check main entry point exists: `apps/saas-backend/src/core/server/index.js`

## Desktop App Build Process

### Mac App Build

#### 1. Workspace Packages
```bash
cd apps/desktop-mac
npm run build:workspace-packages
npm run verify:workspace-packages
```

#### 2. Frontend for Desktop
```bash
cd apps/desktop-mac
npm run build:frontend  # This should call build:electron
```
**Verification:**
- [ ] Check relative paths in built frontend

#### 3. Backend Setup
```bash
cd apps/desktop-mac
npm run copy:backend
npm run install:backend-deps
```
**Verification:**
- [ ] Check `apps/desktop-mac/saas-backend/src/` exists
- [ ] Check `apps/desktop-mac/saas-backend/node_modules/` exists
- [ ] Check `apps/desktop-mac/saas-backend/package.json` has `"type": "module"`

#### 4. Main Process Build
```bash
cd apps/desktop-mac
npm run build:main
```
**Verification:**
- [ ] Check `apps/desktop-mac/dist/main/index.js` exists

#### 5. Copy Assets
```bash
cd apps/desktop-mac
npm run copy:renderer
```
**Verification:**
- [ ] Check `apps/desktop-mac/dist/renderer/index.html` exists
- [ ] Verify it has relative paths (`./assets/...`)

#### 6. Package
```bash
cd apps/desktop-mac
npm run package
```
**Verification:**
- [ ] Check `apps/desktop-mac/build/DesignQA-2.0.1.dmg` exists
- [ ] Check `apps/desktop-mac/build/DesignQA-2.0.1-arm64.dmg` exists
- [ ] File sizes should be reasonable (50-200MB)

### Windows App Build

#### 1. Workspace Packages
```bash
cd apps/desktop-win
npm run build:workspace-packages
npm run verify:workspace-packages
```

#### 2. Frontend for Desktop
```bash
cd apps/desktop-win
npm run build:frontend  # This should call build:electron
```

#### 3. Backend Setup
```bash
cd apps/desktop-win
npm run copy:backend
npm run install:backend-deps
```
**Verification:**
- [ ] Check `apps/desktop-win/saas-backend/` structure matches Mac

#### 4. Main Process Build
```bash
cd apps/desktop-win
npm run build:main
```

#### 5. Copy Assets
```bash
cd apps/desktop-win
npm run copy:renderer
```

#### 6. Package
```bash
cd apps/desktop-win
npm run package
```
**Verification:**
- [ ] Check `apps/desktop-win/build/DesignQA Setup 2.0.1.exe` exists

## Complete Build Script

Use this script for automated builds:

```bash
#!/bin/bash
set -e  # Exit on any error

echo "🚀 Starting DesignQA Complete Build"

# 1. Clean and install dependencies
echo "📦 Installing dependencies..."
pnpm install

# 2. Build frontend for Electron (with relative paths)
echo "🎨 Building frontend for Electron..."
cd apps/saas-frontend
CI=true npm run build:electron
cd ../..

# 3. Build Mac app
echo "🍎 Building Mac app..."
cd apps/desktop-mac
npm run build:workspace-packages
npm run build:frontend
npm run copy:backend
npm run install:backend-deps
npm run build:main
npm run copy:renderer
npm run package
cd ../..

# 4. Build Windows app
echo "🪟 Building Windows app..."
cd apps/desktop-win
npm run build:workspace-packages
npm run build:frontend
npm run copy:backend
npm run install:backend-deps
npm run build:main
npm run copy:renderer
npm run package
cd ../..

echo "✅ Build complete!"
echo "📦 Mac: apps/desktop-mac/build/"
echo "📦 Windows: apps/desktop-win/build/"
```

## Common Issues & Solutions

### Issue: Asset Loading Errors
**Symptoms:** `net::ERR_FILE_NOT_FOUND` for CSS/JS files
**Solution:**
- Ensure frontend was built with `build:electron` (relative paths)
- Never use `build` for desktop apps

### Issue: Backend Connection Refused
**Symptoms:** `net::ERR_CONNECTION_REFUSED` on localhost:3847
**Solution:**
- Run `install:backend-deps` before packaging
- Check backend `node_modules` exists in packaged app

### Issue: Module Import Errors
**Symptoms:** "Cannot use import statement" or "Unexpected token"
**Solution:**
- Verify `saas-backend/package.json` has `"type": "module"`
- Ensure backend files copied correctly

### Issue: Missing Dependencies
**Symptoms:** "Module not found" errors
**Solution:**
- Run `pnpm install` in root
- Run `install:backend-deps` for desktop apps
- Check `node_modules` directories exist

### Issue: Large Bundle Sizes
**Symptoms:** Packages >500MB
**Solution:**
- Check if dev dependencies included
- Verify `.asar` packaging working
- Review `files` section in package.json

## Verification Commands

After build, verify with:

```bash
# Check file structure
find apps/desktop-mac/build -name "*.dmg" -ls
find apps/desktop-win/build -name "*.exe" -ls

# Check app bundle contents (Mac)
cd apps/desktop-mac/build/mac
ls -la DesignQA.app/Contents/Resources/

# Verify backend included
ls -la DesignQA.app/Contents/Resources/app.asar.unpacked/saas-backend/
```

## Emergency Reset

If builds consistently fail:

```bash
# Nuclear option - clean everything
rm -rf node_modules apps/*/node_modules apps/*/dist apps/*/build
rm -rf apps/desktop-*/saas-backend
pnpm install
# Then follow checklist from beginning
```

---

**Key Principle:** Always use `build:electron` for desktop frontend builds!