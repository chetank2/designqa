# Publishing Chrome Extension to Chrome Web Store

This guide covers how to publish the DesignQA Compare Extension to the Chrome Web Store.

## Prerequisites

1. **Chrome Web Store Developer Account**
   - One-time registration fee: $5 USD
   - Visit: https://chrome.google.com/webstore/devconsole
   - Sign in with your Google account
   - Pay the registration fee

2. **Extension Requirements**
   - ✅ Manifest V3 (already using)
   - ✅ Unique name and description
   - ✅ Icons (16x16, 48x48, 128x128)
   - ✅ Privacy policy URL (required for extensions with permissions)

## Step 1: Prepare Extension Assets

### 1.1 Create Icons

You need icons in multiple sizes:
- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

Add to `manifest.json`:
```json
{
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  }
}
```

### 1.2 Add Store Listing Assets

Create these images for the Chrome Web Store listing:
- **Screenshots**: At least 1, up to 5 (1280x800 or 640x400)
- **Small promotional tile**: 440x280 (optional)
- **Marquee promotional tile**: 920x680 (optional)

### 1.3 Update Manifest for Production

Ensure your `manifest.json` includes:
- ✅ `version` (semantic versioning: major.minor.patch)
- ✅ `description` (max 132 characters)
- ✅ `icons` (16, 48, 128)
- ✅ `homepage_url` (optional but recommended)
- ✅ `permissions` justification

## Step 2: Build Production Package

```bash
cd apps/chrome-extension
npm run build
# or
pnpm build
```

This creates a `dist/` folder with:
- `manifest.json`
- `popup.html`
- `background.js`
- `contentScript.js`
- `popup.js`
- Icons (if added)

## Step 3: Create ZIP Package

Create a ZIP file containing ONLY the `dist/` folder contents:

```bash
cd apps/chrome-extension/dist
zip -r ../../designqa-extension-v0.1.0.zip .
```

**Important:**
- ZIP the CONTENTS of `dist/`, not the `dist/` folder itself
- Maximum ZIP size: 10MB (uncompressed)
- Don't include source files, node_modules, or .git files

## Step 4: Prepare Store Listing

### 4.1 Required Information

1. **Name**: "DesignQA Compare Extension" (or your preferred name)
2. **Summary**: Short description (max 132 characters)
   - Example: "Compare Figma designs with live web pages. Extract styles, colors, and spacing directly from any website."
3. **Description**: Detailed description (max 16,000 characters)
   - Explain features, use cases, how it works
   - Use formatting (bullets, line breaks)
4. **Category**: Select appropriate category
   - Likely: "Developer Tools" or "Productivity"
5. **Language**: Select primary language
6. **Privacy Policy URL**: Required for extensions with permissions
   - Host a privacy policy page explaining:
     - What data is collected
     - How data is used
     - Data storage and sharing policies

### 4.2 Privacy Policy Template

Create a privacy policy page. Example structure:

```markdown
# Privacy Policy for DesignQA Compare Extension

## Data Collection
- This extension collects CSS styles and design tokens from web pages you visit
- Data is processed locally in your browser
- No data is sent to external servers without your explicit action

## Permissions
- activeTab: To access styles from the current tab
- scripting: To inject content scripts for style extraction
- storage: To save your comparison preferences locally
- host_permissions: To work on any website you visit

## Data Storage
- All data is stored locally in your browser
- No user data is transmitted to third parties
- You can clear stored data via Chrome's extension settings

## Contact
[Your contact email]
```

## Step 5: Upload to Chrome Web Store

1. **Go to Developer Dashboard**
   - Visit: https://chrome.google.com/webstore/devconsole
   - Click "New Item"

2. **Upload ZIP File**
   - Drag and drop or browse for your ZIP file
   - Wait for upload to complete

3. **Fill Store Listing**
   - Complete all required fields:
     - Name
     - Summary
     - Description
     - Category
     - Language
     - Privacy Policy URL
   - Upload screenshots
   - Add promotional images (optional)

4. **Distribution**
   - **Visibility**: Choose "Public" or "Unlisted"
     - Public: Visible in Chrome Web Store search
     - Unlisted: Only accessible via direct link
   - **Pricing**: Free (or set price if paid)

5. **Additional Information**
   - Single purpose description (if required)
   - Permissions justification
   - Content rating questionnaire

## Step 6: Submit for Review

1. **Review Checklist**
   - ✅ All required fields completed
   - ✅ Privacy policy URL provided
   - ✅ ZIP file uploaded successfully
   - ✅ Screenshots uploaded
   - ✅ Permissions justified

2. **Submit**
   - Click "Submit for Review"
   - Review typically takes 1-3 business days
   - You'll receive email notifications about status

## Step 7: Post-Publication

### 7.1 Monitor Reviews
- Respond to user reviews
- Address reported issues
- Update based on feedback

### 7.2 Update Extension
When updating:
1. Increment version in `manifest.json`
2. Build new package
3. Create new ZIP
4. Upload in Developer Dashboard
5. Submit update for review

### 7.3 Analytics (Optional)
Consider adding:
- Google Analytics
- Chrome Web Store analytics (built-in)
- User feedback mechanisms

## Common Issues & Solutions

### Issue: ZIP too large
- **Solution**: Remove unnecessary files, minify code, optimize images

### Issue: Permissions rejected
- **Solution**: Provide detailed justification in store listing and single purpose description

### Issue: Privacy policy required
- **Solution**: Host privacy policy page and add URL to store listing

### Issue: Review rejected
- **Solution**: Check email for specific reasons, address issues, resubmit

## Quick Reference Commands

```bash
# Build extension
cd apps/chrome-extension
pnpm build

# Create ZIP (from dist folder)
cd dist
zip -r ../../designqa-extension-v0.1.0.zip . -x "*.map" "*.DS_Store"

# Verify ZIP contents
unzip -l designqa-extension-v0.1.0.zip
```

## Resources

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Chrome Extension Publishing Guide](https://developer.chrome.com/docs/webstore/publish/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Web Store Policies](https://developer.chrome.com/docs/webstore/program-policies/)

## Next Steps

1. ✅ Create icons (16x16, 48x48, 128x128)
2. ✅ Add icons to manifest.json
3. ✅ Create privacy policy page
4. ✅ Build production package
5. ✅ Create ZIP file
6. ✅ Register Chrome Web Store developer account ($5)
7. ✅ Upload and submit for review
