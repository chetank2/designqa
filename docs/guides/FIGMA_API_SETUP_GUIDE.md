# Figma API Setup Guide

> Note: Only needed if you are using Figma API/MCP. If not, you can skip this guide.

This guide will help you set up a Figma API token with the correct permissions for the Comparison Tool.

## Creating a Personal Access Token

1. Log in to your Figma account at [figma.com](https://www.figma.com/)

2. Click on your profile picture in the top right corner

3. Select **Settings** from the dropdown menu

4. In the left sidebar, click on **Account**

5. Scroll down to the **Personal access tokens** section

6. Click the **Create a new personal access token** button

7. Enter a name for your token (e.g., "Comparison Tool")

8. **IMPORTANT**: Select ALL of the following scopes:
   - `file_content:read` - Required to access design file content
   - `file_dev_resources:read` - Required to access development resources
   - `library_assets:read` - Required to access library assets
   - `library_content:read` - Required to access library content
   - `current_user:read` - Required to verify your identity

9. Click **Create token**

10. Copy your new token (it starts with `figd_`)

## Adding the Token to the Comparison Tool

1. Open the Comparison Tool application

2. Navigate to the **Settings** page

3. In the **Figma API Settings** section, paste your token into the **Figma Personal Access Token** field

4. Click **Test Connection** to verify that your token works correctly

5. If the test is successful, click **Save Settings** to store your token

## Troubleshooting

If you encounter a "Invalid token" error:

1. Verify that you've selected ALL the required scopes when creating the token
2. Make sure you've copied the entire token correctly
3. Try creating a new token if the issue persists

The most common issue is missing the `current_user:read` scope, which is required for the application to verify your identity.

## Security Note

Your Figma API token grants access to your Figma account and files. Keep it secure and never share it publicly. The Comparison Tool stores your token securely and only uses it for the specified operations.

## 🚨 Current Issue: Invalid API Key Scope

The visual comparison feature is **working correctly**, but the Figma API key has insufficient permissions.

### Error Details
```
"Invalid scope(s): file_dev_resources:read, file_content:read, library_assets:read, library_content:read. This endpoint requires the current_user:read scope"
```

### What This Means
- ✅ **Visual comparison is turned on and functional**
- ❌ **Figma API key lacks required permissions**
- ❌ **Cannot access Figma files** (getting 404 errors)

## 🔧 How to Fix

### 1. Create New Figma Personal Access Token

1. **Go to Figma Account Settings**:
   - Visit: https://www.figma.com/settings
   - Or: Figma → Settings → Account → Personal Access Tokens

2. **Generate New Token**:
   - Click "Create new token"
   - Name: `Design Comparison Tool`
   - **Scopes Required** (select ALL):
     - ✅ `file_content:read` - Read design files
     - ✅ `file_dev_resources:read` - Access development resources
     - ✅ `library_assets:read` - Read library usage
     - ✅ `library_content:read` - Access library content
     - ✅ `current_user:read` - Access user information

3. **Copy the Token**:
   - Save it immediately (you won't see it again)
   - Example: `figd_PLACEHOLDER_TOKEN_FORMAT`

### 2. Update Environment Variable

```bash
# Set the new token
export FIGMA_API_KEY="figd_your_new_token_here"

# Or update your .env file:
echo "FIGMA_API_KEY=figd_your_new_token_here" >> .env
```

### 3. Add to Application Settings

1. Go to the Settings page in our application
2. Paste the token in the Figma API Key field
3. Click "Test Connection" to verify it works

### 4. Restart the Server

```bash
# Stop current server (Ctrl+C)
# Then restart:
npm run dev
```

## 🧪 Test the Fix

### Test 1: Verify API Key Works
```bash
curl -H "X-Figma-Token: YOUR_NEW_TOKEN" "https://api.figma.com/v1/me"
```

**Expected**: Your Figma user profile (not a 403 error)

### Test 2: Test File Access
```bash
curl -H "X-Figma-Token: YOUR_NEW_TOKEN" "https://api.figma.com/v1/files/YOUR_FILE_ID"
```

**Expected**: File data (not 404 error)

### Test 3: Test Visual Comparison
1. Open: http://localhost:5179
2. Enter your Figma URL and a web URL
3. ✅ **Check "Include Visual Comparison"**
4. Submit the comparison
5. **Expected**: Full comparison with visual diffs!

## 📋 File Access Requirements

### Public Files
- ✅ **Any Figma file marked as "Anyone with the link can view"**
- ✅ **Community files and templates**

### Private Files  
- ✅ **Files you own**
- ✅ **Files in teams where you have access**
- ❌ **Private files you don't have access to**

### URL Format
Use these URL formats:
```
https://www.figma.com/design/FILE_ID/File-Name?node-id=NODE_ID
https://www.figma.com/file/FILE_ID/File-Name?node-id=NODE_ID
```

## 🎯 MCP Connection Status

The MCP (Multiplex Communication Protocol) connection is now working successfully. This means:

1. **Dev Mode Integration**: The application can now communicate with Figma Dev Mode
2. **Real-time Updates**: Changes in Figma will be reflected in the comparison tool
3. **Enhanced Features**: Access to additional features through the Dev Mode API

## ✅ What's Fixed Now

1. **Visual Comparison Activated**: `includeVisual` flag now works
2. **Proper Error Messages**: Clear feedback about API issues  
3. **Graceful Degradation**: System continues working even if Figma fails
4. **Complete Integration**: Visual data included in reports and responses
5. **MCP Connection**: Direct communication with Figma Dev Mode

## 🚀 Next Steps

1. **Fix API Key** (follow this guide)
2. **Test with Real Data** 
3. **Enjoy Visual Comparisons**!

Once the API key is fixed, you'll get:
- 📸 **Real web page screenshots**
- 🎨 **Actual Figma design images** 
- 🔍 **Pixel-perfect comparisons**
- 📊 **Visual similarity metrics**
- 📋 **Side-by-side diff reports**

**No more red placeholder images!** 🎉 
