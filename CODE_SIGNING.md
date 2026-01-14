# 🔐 Code Signing Setup Guide

This guide helps you set up code signing for DesignQA desktop applications to ensure they're trusted by operating systems and can be distributed securely.

## 📋 Why Code Signing?

- **Trust & Security**: Users trust signed applications
- **No Security Warnings**: Eliminates scary download warnings
- **App Store Distribution**: Required for official app stores
- **Auto-Updates**: Signed apps can update seamlessly

## 🍎 macOS Code Signing

### Prerequisites

1. **Apple Developer Account** ($99/year)
2. **Developer ID Application Certificate**
3. **App-Specific Password** for notarization

### Step 1: Get Apple Developer Certificate

1. Join [Apple Developer Program](https://developer.apple.com/programs/)
2. Go to **Certificates, Identifiers & Profiles**
3. Create **Developer ID Application** certificate
4. Download the certificate (.cer file)

### Step 2: Export Certificate

1. Open **Keychain Access** on Mac
2. Import the downloaded certificate
3. Right-click certificate → **Export**
4. Choose **Personal Information Exchange (.p12)**
5. Set a strong password
6. Save as `apple-certificate.p12`

### Step 3: Get App-Specific Password

1. Go to [Apple ID Account](https://appleid.apple.com)
2. Sign in with your Apple ID
3. **App-Specific Passwords** → **Generate Password**
4. Label it "DesignQA Notarization"
5. Save the generated password

### Step 4: Add to GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**:

```bash
# Required Secrets:
CSC_LINK                 # Base64 encoded .p12 file
CSC_KEY_PASSWORD         # Certificate password
APPLE_ID                 # Your Apple ID email
APPLE_ID_PASSWORD        # App-specific password
```

**Convert certificate to base64:**
```bash
base64 -i apple-certificate.p12 -o apple-certificate-base64.txt
# Copy contents of apple-certificate-base64.txt to CSC_LINK secret
```

### Step 5: Configure electron-builder

Update your `apps/desktop-mac/package.json`:

```json
{
  "build": {
    "mac": {
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "assets/entitlements.mac.plist",
      "entitlementsInherit": "assets/entitlements.mac.plist"
    },
    "afterSign": "scripts/notarize.js"
  }
}
```

### Step 6: Create Entitlements File

Create `apps/desktop-mac/assets/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.debugger</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
</dict>
</plist>
```

### Step 7: Create Notarization Script

Create `apps/desktop-mac/scripts/notarize.js`:

```javascript
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD) {
    console.log('Skipping notarization: APPLE_ID or APPLE_ID_PASSWORD not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    tool: 'notarytool',
    appBundleId: 'com.designqa.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: 'YOUR_TEAM_ID', // Get from Apple Developer account
  });
};
```

## 🪟 Windows Code Signing

### Prerequisites

1. **Code Signing Certificate** from trusted CA
2. **Certificate file** (.p12 or .pfx format)

### Step 1: Purchase Certificate

**Recommended Certificate Authorities:**
- [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing) (~$200/year)
- [DigiCert](https://www.digicert.com/code-signing/) (~$300/year)
- [SSL.com](https://www.ssl.com/certificates/code-signing/) (~$150/year)
- [GlobalSign](https://www.globalsign.com/en/code-signing-certificate) (~$250/year)

### Step 2: Validate Certificate

1. **Domain Validation**: Prove you own your domain
2. **Organization Validation**: Verify your business details
3. **Phone Verification**: Confirm via phone call
4. Download certificate when approved

### Step 3: Export Certificate (if needed)

If you receive a .cer file, convert to .p12:

```bash
# Using OpenSSL
openssl pkcs12 -export -out certificate.p12 -inkey private.key -in certificate.cer
```

### Step 4: Add to GitHub Secrets

```bash
# Required Secrets:
WIN_CSC_LINK             # Base64 encoded .p12/.pfx file
WIN_CSC_KEY_PASSWORD     # Certificate password
```

**Convert certificate to base64:**
```bash
base64 -i certificate.p12 -o windows-certificate-base64.txt
# Copy contents to WIN_CSC_LINK secret
```

### Step 5: Configure electron-builder

Update your `apps/desktop-win/package.json`:

```json
{
  "build": {
    "win": {
      "certificateFile": null,
      "certificatePassword": null,
      "publisherName": "Your Company Name",
      "verifyUpdateCodeSignature": false
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

## 🔧 Testing Code Signing

### Local Testing

**macOS:**
```bash
# Build signed app
cd apps/desktop-mac
pnpm run package

# Verify signature
codesign -v build/mac/DesignQA.app
spctl -a -t exec -vv build/mac/DesignQA.app
```

**Windows:**
```bash
# Build signed app
cd apps/desktop-win
pnpm run package

# Verify signature (on Windows)
signtool verify /pa "build\DesignQA Setup.exe"
```

### CI/CD Testing

1. **Create Test Release**
   ```bash
   git tag v2.0.1-test
   git push origin v2.0.1-test
   ```

2. **Monitor GitHub Actions**
   - Check build logs for signing steps
   - Verify no certificate errors
   - Download and test signed apps

## 🚨 Troubleshooting

### Common macOS Issues

1. **"No identity found" Error**
   ```bash
   # Check certificates in keychain
   security find-identity -v -p codesigning
   ```

2. **Notarization Fails**
   ```bash
   # Check notarization status
   xcrun notarytool log --apple-id YOUR_APPLE_ID --password YOUR_PASSWORD --team-id YOUR_TEAM_ID SUBMISSION_ID
   ```

3. **Hardened Runtime Issues**
   - Review entitlements file
   - Check for unsigned binaries in app bundle

### Common Windows Issues

1. **Certificate Not Found**
   - Verify certificate path and password
   - Check certificate expiration date

2. **Timestamp Server Errors**
   - GitHub Actions may have network issues
   - Add retry logic to build script

3. **Invalid Certificate Chain**
   - Ensure intermediate certificates are included
   - Use complete certificate chain

### Debug Commands

```bash
# macOS: Check signing identity
security find-identity -v -p codesigning

# macOS: Verify app signature
codesign -dv --verbose=4 /path/to/app.app

# Windows: Check certificate info
certutil -dump certificate.p12

# Windows: Verify executable signature
signtool verify /v /pa "app.exe"
```

## 📊 Verification Steps

### For Users

**macOS:**
- No "Unknown Developer" warnings
- App opens without security prompts
- Updates install automatically

**Windows:**
- No SmartScreen warnings
- Publisher shows your company name
- Windows Defender doesn't flag app

### For Developers

**macOS:**
```bash
# Verify notarization
spctl -a -t exec -vv DesignQA.app

# Check gatekeeper status
spctl --status
```

**Windows:**
```bash
# Check certificate details
signtool verify /v /pa "DesignQA Setup.exe"

# Verify timestamp
signtool verify /v /kp "DesignQA Setup.exe"
```

## 💡 Best Practices

1. **Security**
   - Keep certificates secure and encrypted
   - Use strong passwords
   - Rotate certificates before expiry

2. **Automation**
   - Test signing in staging first
   - Monitor certificate expiration dates
   - Set up alerts for signing failures

3. **User Experience**
   - Sign all executables and installers
   - Include proper metadata (company, description)
   - Test on clean systems before release

## 📞 Support Resources

- [Apple Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/)
- [Microsoft Code Signing Best Practices](https://docs.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-best-practices)
- [electron-builder Code Signing](https://www.electron.build/code-signing)

---

🔒 Secure your applications and build user trust! 🚀