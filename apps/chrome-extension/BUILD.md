# Building the Chrome Extension

## Environment Configuration

The extension's backend URL is baked into the bundle at build time. You can configure it using the `EXTENSION_BACKEND_URL` environment variable.

### Default Behavior

If `EXTENSION_BACKEND_URL` is not set, the extension defaults to `http://localhost:3847`.

### Setting Backend URL During Build

**Option 1: Inline environment variable**
```bash
EXTENSION_BACKEND_URL=https://your-api.example.com pnpm --filter @myapp/chrome-extension run build
```

**Option 2: Export before building**
```bash
export EXTENSION_BACKEND_URL=https://your-api.example.com
pnpm --filter @myapp/chrome-extension run build
```

**Option 3: Using .env file (if using dotenv)**
```bash
# Create .env file
echo "EXTENSION_BACKEND_URL=https://your-api.example.com" > .env
pnpm --filter @myapp/chrome-extension run build
```

### Examples

**Local Development:**
```bash
pnpm --filter @myapp/chrome-extension run build
# Uses default: http://localhost:3847
```

**Staging:**
```bash
EXTENSION_BACKEND_URL=https://api.staging.example.com pnpm --filter @myapp/chrome-extension run build
```

**Production:**
```bash
EXTENSION_BACKEND_URL=https://api.production.example.com pnpm --filter @myapp/chrome-extension run build
```

### Verifying the Build

After building, you can verify the backend URL is baked in:

```bash
# Check what URL was baked into the bundle
grep -o "https://api.example.com\|http://localhost:3847" apps/chrome-extension/dist/background.js | head -1
```

Or for any URL:
```bash
grep -o "http[s]*://[a-zA-Z0-9.-]*[:0-9]*" apps/chrome-extension/dist/background.js | head -1
```

This should show the backend URL that was set during build.

### Important Notes

- The backend URL is **baked into the bundle** at build time, not read at runtime
- You must rebuild the extension if you want to change the backend URL
- The URL is stripped of trailing slashes automatically
- After updating, reload the unpacked extension in Chrome (`chrome://extensions/`)
