# DesignQA Clean Build SOP for Cursor

## Overview
This SOP provides step-by-step instructions for building all DesignQA applications cleanly in Cursor without including old build files in new packages.

## Prerequisites
- Node.js 20+ installed
- pnpm package manager
- Cursor IDE
- Git repository cloned

## Build Order & Dependencies

### 1. Workspace Packages (Build First)
```bash
# Clean and build MCP Client
cd packages/mcp-client
rm -rf dist node_modules
pnpm install
pnpm run build

# Clean and build Compare Engine
cd ../compare-engine
rm -rf dist node_modules
pnpm install
pnpm run build
```

### 2. SaaS Backend
```bash
cd apps/saas-backend
rm -rf node_modules
pnpm install
# No build step - runs directly from source
```

### 3. SaaS Frontend
```bash
cd apps/saas-frontend
rm -rf dist node_modules .vite
pnpm install
pnpm run build
```

### 4. Chrome Extension
```bash
cd apps/chrome-extension
rm -rf dist node_modules
pnpm install
pnpm run build:prod
```

### 5. Desktop Applications

#### Windows Desktop
```bash
cd apps/desktop-win
# Complete cleanup
rm -rf dist build node_modules saas-backend/node_modules
rm -rf saas-backend/src

# Full build process
pnpm run build
# This includes: workspace packages, backend copy, deps install, main/renderer build

# Package for distribution
pnpm run package
```

#### macOS Desktop
```bash
cd apps/desktop-mac
# Complete cleanup
rm -rf dist build node_modules saas-backend preload/dist
rm -rf saas-backend/node_modules saas-backend/src

# Full build process
pnpm run build
# This includes: workspace packages, frontend build, backend copy, and deps installation.
# NOTE: The build script has been updated to use native 'npm' for backend node_modules 
# to ensure physical files (not symlinks) are packaged into the DMG.

# Package for distribution
pnpm run package
```

## Critical Clean Build Steps

### 1. Global Cleanup (Run First)
```bash
# From project root
find . -name "node_modules" -type d -exec rm -rf {} +
find . -name "dist" -type d -exec rm -rf {} +
find . -name "build" -type d -exec rm -rf {} +
find . -name ".vite" -type d -exec rm -rf {} +
pnpm store prune
```

### 2. Version Synchronization
```bash
# Ensure all packages have consistent versions
node scripts/sync-version.js
```

### 3. Workspace Dependencies
```bash
# Install root dependencies first
pnpm install
```

## Build Verification

### Check Build Outputs
```bash
# Verify workspace packages
ls -la packages/mcp-client/dist
ls -la packages/compare-engine/dist

# Verify frontend build
ls -la apps/saas-frontend/dist

# Verify extension build
ls -la apps/chrome-extension/dist

# Verify desktop builds
ls -la apps/desktop-win/dist
ls -la apps/desktop-mac/dist

# Verify packaged apps
ls -la apps/desktop-win/build
ls -la apps/desktop-mac/build
```

### Version Consistency Check
```bash
# All should show same version
node -p "require('./package.json').version"
node -p "require('./packages/mcp-client/package.json').version"
node -p "require('./packages/compare-engine/package.json').version"
node -p "require('./apps/saas-frontend/package.json').version"
# etc.
```

## Troubleshooting

### Common Issues

1. **Stale Dependencies**
   - Solution: Always run cleanup commands first
   - Clear pnpm store: `pnpm store prune`

2. **Workspace Reference Errors**
   - Solution: Build packages in correct order (workspace packages first)
   - Verify workspace:* references in package.json

3. **Version Mismatches**
   - Solution: Run `node scripts/sync-version.js`
   - Check all package.json files have same version

5. **Missing Backend Dependencies in Packaged App**
   - Symptoms: "The desktop server at http://localhost:3847 is not responding" or logs showing "Backend node_modules not found".
   - Cause: pnpm workspace hoisting creates symlinks that are not correctly packaged by electron-builder.
   - Solution: The `install-backend-deps.js` script now uses `npm install --omit=dev` to create a local, non-hoisted `node_modules`. Ensure you have run `pnpm run build` in the desktop directory which triggers this script.

6. **Missing Preload Scripts (Mac)**
   - Solution: Verify preload directory copied correctly
   - Check dist/preload exists

### Build Failure Recovery
```bash
# Complete reset and rebuild
git clean -fdx
pnpm install
node scripts/sync-version.js

# Rebuild in order
cd packages/mcp-client && pnpm run build
cd ../compare-engine && pnpm run build
cd ../../apps/saas-frontend && pnpm run build
cd ../desktop-win && pnpm run build
cd ../desktop-mac && pnpm run build
```

## Package Distribution

### Files Included in Packages

#### Windows Package
- Application: `apps/desktop-win/build/DesignQA Setup.exe`
- Includes: Frontend UI, Backend server, Workspace packages
- Excludes: TypeScript sources, dev dependencies, test files

#### macOS Package
- Application: `apps/desktop-mac/build/DesignQA-{version}.dmg`
- Includes: Frontend UI, Backend server, Workspace packages, Preload scripts
- Excludes: TypeScript sources, dev dependencies, test files

### Pre-Distribution Checklist
- [ ] All builds completed without errors
- [ ] Version numbers consistent across all packages
- [ ] No TypeScript files in dist directories
- [ ] Backend dependencies properly copied
- [ ] Package sizes reasonable (no unnecessary files)
- [ ] Test basic functionality of each application

## Environment Variables

### Production Builds
```bash
# Extension
EXTENSION_BACKEND_URL=https://api.designqa.com

# Desktop Apps (handled automatically by build scripts)
NODE_ENV=production
```

## Automation in Cursor

### Recommended Tasks
1. Create task: "Clean Build All" → Run complete cleanup and build sequence
2. Create task: "Package Desktop Apps" → Build and package both desktop applications
3. Create task: "Version Sync" → Ensure version consistency before builds

This SOP ensures clean, consistent builds without old artifacts contaminating new packages.