# DesignQA Developer Guide
## Critical Issues, Solutions, and Best Practices

This guide documents critical issues encountered during development and their solutions. Follow these guidelines to avoid common pitfalls and ensure smooth development.

---

## 🏗️ Architecture Overview

### Core Design Principle
**DesignQA runs on a single-port architecture where both frontend and backend operate on port 3847.**

- **Backend Server**: Serves API endpoints at `http://localhost:3847/api/*`
- **Frontend Assets**: Served by the same backend at `http://localhost:3847/*`
- **Desktop App**: Embeds both frontend and backend, auto-starts on port 3847
- **Health Check**: Available at `http://localhost:3847/api/health`

---

## 🚨 Critical Issues & Solutions

### 1. Desktop App Backend Auto-Start Failure

#### **Problem**
- Mac app showed "Local backend unreachable" on startup
- Backend server wasn't starting automatically despite being configured
- Connection refused errors to `localhost:3847`

#### **Root Cause**
Workspace package resolution failure in the packaged Electron app:
```
Cannot find package '@myapp/compare-engine' imported from [backend path]
```

#### **Solution**
1. **Update `copy-backend.js`** to include workspace packages:
```javascript
// Copy workspace packages to fix dependency resolution
const packagesDir = join(desktopMacDir, '../../packages');
if (existsSync(packagesDir)) {
  const targetPackagesDir = join(targetBackendDir, 'packages');
  await cp(packagesDir, targetPackagesDir, { recursive: true });
  console.log('✅ Copied workspace packages to backend/packages');
}
```

2. **Fix dependency paths** in `copy-backend.js`:
```javascript
// Change from: file:../../../packages/${packageName}
// Change to: file:./packages/${packageName}
const relativePath = `file:./packages/${packageName}`;
```

3. **Update electron-builder configuration**:
```json
"asarUnpack": [
  "saas-backend/src/**/*",
  "saas-backend/package.json",
  "saas-backend/node_modules/**/*",
  "saas-backend/packages/**/*"  // ← Critical addition
]
```

#### **Prevention**
- Always test workspace package resolution in packaged apps
- Verify `node_modules` contains physical files, not just symlinks
- Check that all workspace dependencies are included in the build

### 2. Build Process Dependencies

#### **Problem**
Backend dependencies weren't properly installed during desktop app packaging, leading to missing modules in the final app.

#### **Root Cause**
- pnpm workspace symlinks don't work in packaged Electron apps
- Backend dependencies need to be physically present, not symlinked

#### **Solution**
1. **Use npm for backend dependencies** in `install-backend-deps.js`:
```javascript
// Use npm instead of pnpm to avoid workspace hoisting/symlink issues
await run('npm', ['install', '--omit=dev', '--ignore-scripts'], targetBackendDir);
```

2. **Correct build order** in `package.json`:
```json
"build": "npm run build:workspace-packages && npm run copy:backend && npm run install:backend-deps && npm run build:main && npm run package"
```

#### **Prevention**
- Never use pnpm for Electron backend dependencies
- Always install backend deps after copying backend files
- Test packaged app on clean systems without development workspace

### 3. Web Extraction Timeout Issues

#### **Problem**
Web extraction fails for complex sites (like FreightTiger) due to insufficient timeout periods.

#### **Root Cause**
- Default timeouts too short for heavy websites
- Large DOM parsing takes additional time
- Network latency not accounted for

#### **Solution**
1. **Increase timeout values** in web extraction:
```javascript
// Increase from default 30s to 60s+ for complex sites
const extractionTimeout = 60000; // 1 minute
const navigationTimeout = 30000; // 30 seconds
```

2. **Add retry logic**:
```javascript
const maxRetries = 3;
for (let i = 0; i < maxRetries; i++) {
  try {
    return await extractWebsite(url);
  } catch (error) {
    if (i === maxRetries - 1) throw error;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

#### **Prevention**
- Always test with complex, real-world websites
- Implement progressive timeout increases
- Add proper error handling for timeout scenarios

### 4. MCP (Model Context Protocol) Configuration

#### **Problem**
- MCP connection failures between desktop app and Figma
- Port conflicts between different MCP services

#### **Solution**
1. **Desktop MCP configuration** in `server.ts`:
```javascript
// Desktop MCP defaults (Figma Desktop uses 3845)
if (!process.env.FIGMA_MCP_PORT) {
  process.env.FIGMA_MCP_PORT = '3845';
}
process.env.FIGMA_CONNECTION_MODE = 'desktop';
```

2. **Proper environment setup**:
```javascript
process.env.DEPLOYMENT_MODE = 'desktop';
process.env.RUNNING_IN_ELECTRON = 'true';
process.env.ENABLE_LOCAL_MCP = 'true';
```

#### **Prevention**
- Always set MCP environment variables early in startup
- Use different ports for different MCP services (3845 for Figma, 3847 for main)
- Test MCP connectivity in both development and production modes

### 5. Disk Space Issues During Build

#### **Problem**
```
ENOSPC: no space left on device
```

#### **Root Cause**
- Electron builder creates multiple architecture builds simultaneously
- Large node_modules directories in both source and packaged app

#### **Solution**
1. **Build single architecture** when space is limited:
```bash
npx electron-builder --mac --arm64  # ARM64 only
# OR
npx electron-builder --mac --x64    # Intel only
```

2. **Clean build artifacts**:
```bash
rm -rf build/mac build/mac-arm64
rm -rf dist/
```

#### **Prevention**
- Monitor disk space before building
- Clean previous builds regularly
- Consider building on systems with sufficient disk space

---

## 📋 Development Checklist

### Before Starting Development
- [ ] Verify Node.js version >= 18.0.0
- [ ] Install dependencies with `pnpm install`
- [ ] Build workspace packages: `pnpm run build:packages`
- [ ] Test backend startup on port 3847

### Before Committing Code
- [ ] Run `npm run lint` and fix all issues
- [ ] Run `npm run typecheck` if available
- [ ] Test both development and production builds
- [ ] Verify MCP connections work
- [ ] Test web extraction with complex sites

### Before Releasing Desktop App
- [ ] Test backend dependency installation: `npm run install:backend-deps`
- [ ] Verify workspace packages are copied: `npm run copy:backend`
- [ ] Build and test development version: `npm run build`
- [ ] Package and install DMG: `npm run package`
- [ ] Test auto-startup in packaged app
- [ ] Verify MCP connectivity in production
- [ ] Test with real Figma files and websites

---

## 🛠️ Build Commands

### Development
```bash
# Start development server
npm run dev

# Build workspace packages
pnpm run build:packages

# Copy backend for desktop packaging
npm run copy:backend

# Install backend dependencies
npm run install:backend-deps
```

### Production
```bash
# Full build process
npm run build

# Package desktop app (both architectures)
npm run package

# Package single architecture (saves disk space)
npx electron-builder --mac --arm64
```

---

## 🔍 Troubleshooting

### "Local backend unreachable" Error
1. Check if port 3847 is available: `lsof -i :3847`
2. Verify backend dependencies: `ls apps/desktop-mac/saas-backend/node_modules/`
3. Check workspace packages: `ls apps/desktop-mac/saas-backend/packages/`
4. Review logs: `tail -f ~/Library/Logs/DesignQA/main-process.log`

### MCP Connection Issues
1. Verify Figma is running with developer mode enabled
2. Check MCP port configuration (default: 3845)
3. Restart both DesignQA and Figma
4. Check firewall settings for localhost connections

### Build Failures
1. Clean node_modules: `rm -rf node_modules && pnpm install`
2. Clear build cache: `rm -rf build/ dist/`
3. Check disk space: `df -h`
4. Verify all dependencies are installed

### Web Extraction Timeouts
1. Increase timeout values in extraction configuration
2. Test with simpler websites first
3. Check network connectivity
4. Monitor browser console for JavaScript errors

---

## 📚 Key Files & Directories

```
designqa/
├── apps/
│   ├── desktop-mac/
│   │   ├── scripts/
│   │   │   ├── copy-backend.js          # Copies backend + workspace packages
│   │   │   └── install-backend-deps.js  # Installs backend deps with npm
│   │   ├── src/main/
│   │   │   ├── index.ts                 # Main Electron process
│   │   │   └── server.ts                # Embedded server startup
│   │   └── package.json                 # Build configuration
│   └── saas-backend/
│       ├── src/core/server/index.js     # Main backend server
│       └── package.json                 # Backend dependencies
├── packages/                            # Workspace packages
│   ├── mcp-client/                      # MCP client library
│   └── compare-engine/                  # Comparison engine
└── DEVELOPER_GUIDE.md                   # This file
```

---

## 🚀 Performance Tips

1. **Use npm for Electron backend deps** (not pnpm)
2. **Test with real websites** during development
3. **Build single architecture** when disk space is limited
4. **Clean build artifacts** regularly
5. **Monitor MCP connections** for stability
6. **Use proper timeout values** for web extraction
7. **Test packaged apps** on clean systems

---

## 📞 Support

When encountering issues:
1. Check this guide first
2. Review the logs in `~/Library/Logs/DesignQA/`
3. Test with minimal reproduction cases
4. Document new issues and solutions in this guide

---

*Last updated: January 8, 2026*
*Contributors: Claude Code Development Team*