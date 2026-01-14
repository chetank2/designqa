# 🚀 DesignQA Deployment Guide

This guide explains how to distribute your DesignQA applications through GitHub Actions and various deployment platforms.

## 📋 Table of Contents

- [Desktop Apps Distribution](#desktop-apps-distribution)
- [Web Apps Distribution](#web-apps-distribution)
- [Auto-Update System](#auto-update-system)
- [Code Signing](#code-signing)
- [Deployment Platforms](#deployment-platforms)

## 🖥️ Desktop Apps Distribution

### Automatic Release Distribution

1. **Create a Release**
   ```bash
   # Tag your release
   git tag v2.0.2
   git push origin v2.0.2
   ```

2. **GitHub Release Process**
   - Go to GitHub → Releases → "Create a new release"
   - Choose your tag (v2.0.2)
   - Add release notes
   - Click "Publish release"

3. **Automatic Build Process**
   - ✅ Mac DMG files (Intel + Apple Silicon)
   - ✅ Windows EXE installer
   - ✅ Upload to release assets
   - ✅ Generate download links

### Manual Deployment

You can also trigger builds manually:

1. Go to **Actions** tab in GitHub
2. Select **"Build Desktop Apps"**
3. Click **"Run workflow"**
4. Enter tag name (e.g., `v2.0.1`)

## 🌐 Web Apps Distribution

### Frontend (React + Vite)

**Build Command:**
```bash
cd apps/saas-frontend
CI=true pnpm build
```

**Deploy to Platforms:**

#### Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from frontend directory
cd apps/saas-frontend
vercel --prod
```

#### Netlify
```bash
# Build and deploy
cd apps/saas-frontend
pnpm build
npx netlify deploy --prod --dir=dist
```

#### AWS S3 + CloudFront
```bash
# Upload to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

### Backend (Node.js + Express)

**Build Command:**
```bash
cd apps/saas-backend
CI=true pnpm build
```

**Deploy to Platforms:**

#### Railway
```bash
# Connect to Railway
railway login
railway init
railway deploy
```

#### Render
```bash
# Create render.yaml in root:
services:
  - type: web
    name: designqa-backend
    env: node
    buildCommand: cd apps/saas-backend && pnpm install && pnpm build
    startCommand: cd apps/saas-backend && node server.js
```

#### Docker Deployment
```dockerfile
# Dockerfile for backend
FROM node:20-alpine

WORKDIR /app
COPY apps/saas-backend/package.json .
RUN npm install --production
COPY apps/saas-backend .

EXPOSE 3000
CMD ["node", "server.js"]
```

## 🔄 Auto-Update System

### Setting Up Auto-Updates

1. **Update Manifest Generation**
   - Automatically creates `update-manifest.json`
   - Contains download URLs and version info
   - Uploaded to GitHub release assets

2. **Client-Side Update Checking**
   ```javascript
   // Add to your Electron main process
   const { autoUpdater } = require('electron-updater');

   autoUpdater.checkForUpdatesAndNotify();
   autoUpdater.setFeedURL({
     provider: 'github',
     owner: 'your-username',
     repo: 'your-repo',
     private: false
   });
   ```

3. **Update Flow**
   - App checks for updates on startup
   - Downloads updates in background
   - Prompts user to restart and install

## 🔐 Code Signing

### macOS Code Signing

1. **Setup Apple Developer Account**
   - Get Developer ID Application certificate
   - Export as .p12 file

2. **Add Secrets to GitHub**
   ```bash
   # In GitHub repository settings → Secrets
   CSC_LINK: base64-encoded .p12 file
   CSC_KEY_PASSWORD: certificate password
   APPLE_ID: your Apple ID
   APPLE_ID_PASSWORD: app-specific password
   ```

3. **Update electron-builder config**
   ```json
   {
     "build": {
       "mac": {
         "hardenedRuntime": true,
         "gatekeeperAssess": false,
         "entitlements": "assets/entitlements.mac.plist"
       },
       "afterSign": "scripts/notarize.js"
     }
   }
   ```

### Windows Code Signing

1. **Get Code Signing Certificate**
   - Purchase from trusted CA (Sectigo, DigiCert, etc.)
   - Or use self-signed for testing

2. **Add to GitHub Secrets**
   ```bash
   WIN_CSC_LINK: base64-encoded .p12/.pfx file
   WIN_CSC_KEY_PASSWORD: certificate password
   ```

## 🌍 Deployment Platforms

### Recommended Platforms

#### For Frontend (Static Hosting)
- **Vercel** - Zero config React deployment
- **Netlify** - Great for SPAs with form handling
- **AWS S3 + CloudFront** - Scalable global CDN
- **GitHub Pages** - Free for public repos

#### For Backend (Server Hosting)
- **Railway** - Simple Node.js deployment
- **Render** - Easy Docker deployments
- **AWS EC2/ECS** - Full control and scaling
- **Digital Ocean App Platform** - Managed containers

#### For Database
- **Supabase** - PostgreSQL with real-time features
- **PlanetScale** - Serverless MySQL
- **MongoDB Atlas** - Managed MongoDB
- **AWS RDS** - Managed relational databases

### Environment Variables

Create `.env` files for each environment:

```bash
# .env.production
VITE_API_URL=https://api.designqa.com
DATABASE_URL=postgresql://...
FIGMA_CLIENT_ID=your_client_id
```

## 📊 Monitoring & Analytics

### Application Monitoring
- **Sentry** - Error tracking and performance
- **LogRocket** - Session replay and logging
- **New Relic** - Application performance monitoring

### Usage Analytics
- **Google Analytics 4** - User behavior tracking
- **Mixpanel** - Event-based analytics
- **PostHog** - Open-source product analytics

## 🚀 Quick Start Commands

```bash
# Create new release
git tag v2.0.2 && git push origin v2.0.2

# Build all apps locally
pnpm run build:all

# Build specific apps
pnpm run build:frontend
pnpm run build:backend
pnpm -w run build:desktop:mac
pnpm -w run build:desktop:win

# Manual deployment trigger
# Go to GitHub Actions → "Build Desktop Apps" → "Run workflow"
```

## 🔧 Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   pnpm install
   ```

2. **Code Signing Issues**
   - Verify certificate validity
   - Check environment variables in GitHub secrets
   - Ensure proper entitlements file

3. **Auto-Update Not Working**
   - Check update server URLs
   - Verify JSON manifest format
   - Test with different app versions

### Debug Commands

```bash
# Check build outputs
ls -la apps/desktop-mac/build/
ls -la apps/desktop-win/build/

# Verify package integrity
file apps/desktop-mac/build/*.dmg
file apps/desktop-win/build/*.exe

# Test auto-update manifest
curl -s https://github.com/your-repo/releases/latest/download/latest.json | jq
```

## 📞 Support

For deployment issues:
1. Check GitHub Actions logs
2. Review error messages in build output
3. Consult platform-specific documentation
4. Create issue in repository for help

---

Happy Deploying! 🎉