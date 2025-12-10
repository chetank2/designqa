# DesignQA Desktop App User Guide

## Installation

### macOS

1. Download the DesignQA Desktop app DMG file
2. Open the DMG and drag DesignQA to Applications
3. **Important**: Since the app is unsigned, you'll need to:
   - Right-click the app → Open
   - Click "Open" in the security dialog
   - Or go to System Preferences → Security & Privacy → Allow

### Windows

1. Download the DesignQA Desktop installer (.exe)
2. Run the installer
3. Follow the installation wizard
4. If Windows Defender blocks the app, click "More info" → "Run anyway"

## First Launch

1. Launch DesignQA Desktop
2. The app will start an embedded server (usually on port 3847)
3. Your browser will open automatically to the app interface

## Connecting to Figma Desktop MCP

### Prerequisites

- Figma Desktop app must be installed and running
- Figma Desktop MCP server must be enabled (usually automatic)

### Steps

1. Open DesignQA Desktop app
2. Go to Settings → Figma Integration
3. Look for the "Figma Desktop MCP" section
4. If Desktop MCP is available, you'll see a toggle
5. Enable "Use Desktop MCP"
6. The app will automatically discover and connect to Figma Desktop MCP

## Firewall Permissions

### macOS

macOS may prompt you to allow network connections:
1. Click "Allow" when prompted
2. Or go to System Preferences → Security & Privacy → Firewall → Options
3. Add DesignQA to allowed apps

### Windows

Windows Firewall may block the app:
1. When prompted, click "Allow access"
2. Or go to Windows Defender Firewall → Allow an app
3. Add DesignQA to allowed apps

## Troubleshooting

### Desktop MCP Not Detected

**Problem**: The app says "Desktop MCP is not available"

**Solutions**:
1. Make sure Figma Desktop app is running
2. Check if Figma Desktop MCP is enabled in Figma settings
3. Try restarting both Figma Desktop and DesignQA Desktop
4. Check firewall settings (see above)

### Connection Fails

**Problem**: Desktop MCP connection fails

**Solutions**:
1. Verify Figma Desktop is running
2. Check the port (usually 3845) is not blocked
3. Try disabling and re-enabling Desktop MCP in settings
4. Check DesignQA Desktop logs for error messages

### App Won't Start

**Problem**: App crashes on launch

**Solutions**:
1. Check if port 3847 is already in use
2. Try running from terminal to see error messages
3. Delete app data and restart (location varies by OS)
4. Reinstall the app

## Using Desktop MCP with SaaS

### Enabling Desktop MCP in SaaS

1. Log into the SaaS web app
2. Go to Settings → Figma Integration
3. If you have DesignQA Desktop running and registered, you'll see "Desktop MCP" option
4. Enable the toggle
5. Comparisons will now use your local Desktop MCP when available

### Syncing Preferences

- Desktop MCP preference is synced to your user profile
- Works across devices when logged into the same account
- Preference is stored locally in Desktop app and in SaaS backend

## Running Comparisons

Once Desktop MCP is enabled:

1. Go to New Comparison page
2. Enter Figma URL
3. Enter Web URL
4. Click "Compare"
5. The system will automatically use Desktop MCP if available, falling back to Remote/Proxy if needed

## Offline Mode

DesignQA Desktop works offline when:
- Figma Desktop app is running
- Desktop MCP is enabled
- You're comparing designs (no SaaS backend required)

Note: Some features like syncing reports to cloud require internet connection.
