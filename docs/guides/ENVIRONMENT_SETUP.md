# Environment Setup Guide

This guide explains how to configure environment variables for cloud deployments (Render/Railway) of the Figma-Web Comparison Tool.

**Note**: This application is designed for cloud deployments only. Local desktop mode is no longer supported.

## 🔐 **Required Environment Variables**

### **Figma Configuration**
```bash
# Figma Personal Access Token (REQUIRED)
FIGMA_API_KEY=figd_your_actual_token_here

# Figma Connection Mode (REQUIRED)
FIGMA_CONNECTION_MODE=figma  # Options: 'api' (direct REST API) or 'figma' (Remote MCP - recommended)

# Optional Figma Configuration
FIGMA_MCP_URL=https://mcp.figma.com/mcp  # Only used if FIGMA_CONNECTION_MODE=figma
```

### **Server Configuration**
```bash
# Server Settings
PORT=3847
# SERVER_HOST: For cloud deployments use '0.0.0.0' or leave unset (defaults to 0.0.0.0)
# SERVER_HOST=0.0.0.0

# MCP Configuration (Remote MCP only for cloud deployments)
FIGMA_CONNECTION_MODE=figma  # Use 'figma' for Remote MCP or 'api' for direct REST API
FIGMA_MCP_URL=https://mcp.figma.com/mcp  # Optional, defaults to https://mcp.figma.com/mcp
```

### **Application Environment**
```bash
# Environment Type
NODE_ENV=development  # or 'production' or 'test'

# Output Directories
REPORT_DIR=./output/reports
SCREENSHOT_DIR=./output/screenshots
IMAGE_DIR=./output/images
```

### **Security Configuration**
```bash
# Security Settings (REQUIRED for production)
SESSION_SECRET=your_secure_session_secret_here
CORS_ORIGIN=*  # or specific domain for production
RATE_LIMIT_MAX=100
```

### **Testing Configuration**
```bash
# Test Environment
TEST_SERVER_URL=http://localhost:3004
TEST_PASSWORD=secure-test-password
MOCK_WEB_URL=https://example.com
MOCK_LOGIN_URL=https://example.com/login
```

## 🚀 **Setup Instructions**

### **1. Create Environment File**
Create a `.env` file in your project root:

```bash
# Copy this template and fill in your values
cp .env.example .env
```

### **2. Get Figma Access Token**
1. Visit [Figma Developer Settings](https://www.figma.com/developers/api#access-tokens)
2. Click "Generate new token"
3. Copy the token (starts with "figd_")
4. Add to your `.env` file:
   ```bash
   FIGMA_ACCESS_TOKEN=figd_your_actual_token_here
   ```

### **3. Configure Figma Connection Mode**
Choose between Remote MCP (recommended) or Direct API:
```bash
# Option 1: Remote MCP (recommended - full MCP protocol features)
FIGMA_CONNECTION_MODE=figma
FIGMA_API_KEY=figd_your_token_here

# Option 2: Direct API (simpler, direct REST API calls)
FIGMA_CONNECTION_MODE=api
FIGMA_API_KEY=figd_your_token_here
```

### **4. Set Production Security**
For production deployment:
```bash
NODE_ENV=production
SESSION_SECRET=your_very_secure_random_string_here
CORS_ORIGIN=https://yourdomain.com
```

## 🔧 **Configuration Priority**

The application uses this priority order:
1. **Environment Variables** (highest priority)
2. **config.json** (fallback)
3. **Default values** (lowest priority)

## 📝 **Environment File Template**

Create `.env` file with these variables:

```bash
# ===========================================
# FIGMA-WEB COMPARISON TOOL - ENVIRONMENT CONFIG
# ===========================================

# Figma Configuration
FIGMA_ACCESS_TOKEN=
FIGMA_BASE_URL=https://api.figma.com
FIGMA_DEFAULT_FILE_ID=
FIGMA_DEFAULT_NODE_ID=

# Server Configuration
PORT=3847
# SERVER_HOST=0.0.0.0  # Optional, defaults to 0.0.0.0 for cloud deployments

# Figma Configuration
FIGMA_CONNECTION_MODE=figma  # Use 'figma' for Remote MCP or 'api' for direct API
FIGMA_API_KEY=figd_your_token_here
# FIGMA_MCP_URL=https://mcp.figma.com/mcp  # Optional, defaults to https://mcp.figma.com/mcp

# Supabase Configuration (REQUIRED for cloud deployments)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx
SUPABASE_ANON_KEY=xxx
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Application Environment
NODE_ENV=development
REPORT_DIR=./output/reports
SCREENSHOT_DIR=./output/screenshots
IMAGE_DIR=./output/images

# Security (CHANGE IN PRODUCTION!)
SESSION_SECRET=development-secret-change-in-production
CORS_ORIGIN=*
RATE_LIMIT_MAX=100

# Testing
TEST_SERVER_URL=http://localhost:3004
TEST_PASSWORD=secure-test-password
MOCK_WEB_URL=https://example.com
MOCK_LOGIN_URL=https://example.com/login
```

## ⚠️ **Security Notes**

1. **Never commit `.env` files** to version control
2. **Rotate tokens regularly** in production
3. **Use strong session secrets** in production
4. **Restrict CORS origins** in production
5. **Monitor API usage** to detect token misuse

## 🔍 **Validation**

The application will validate environment variables on startup:
- **Development**: Warnings for missing variables
- **Production**: Errors for required variables

## 🆘 **Troubleshooting**

### **"No Figma access method configured"**
- Set `FIGMA_ACCESS_TOKEN` environment variable
- Or enable MCP server in config.json

### **"Environment validation failed"**
- Check required variables are set
- Verify token format (starts with "figd_")
- Ensure NODE_ENV is set correctly

### **"MCP connection failed"**
- Verify `FIGMA_API_KEY` is set correctly
- Check `FIGMA_CONNECTION_MODE` is set to 'figma' or 'api'
- For Remote MCP, ensure `FIGMA_MCP_URL` is correct (defaults to https://mcp.figma.com/mcp)
- Verify your Figma token has the required permissions

## 📚 **Related Documentation**

- [Figma API Documentation](https://www.figma.com/developers/api)
- [MCP Server Setup](./MCP_SETUP.md)
- [Security Best Practices](./SECURITY.md) 