/**
 * MCP Test Connection Routes
 * Separate endpoint for testing MCP connections
 */

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

/**
 * POST /api/mcp/test-connection
 * Test MCP connection based on method
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { method, serverUrl, endpoint, environment } = req.body;
    
    // Removed: console.log('🔍 Testing MCP connection:', { method, serverUrl, endpoint });
    
    switch (method) {
      case 'direct_api':
      case 'api':
        return await testDirectAPI(req, res);
        
      case 'mcp_tools':
        return await testMCPTools(req, res);
        
      case 'none':
        return res.json({
          success: false,
          error: 'No connection method selected'
        });
        
      default:
        return res.json({
          success: false,
          error: `Unknown connection method: ${method}. Supported methods: api, mcp_tools`
        });
    }
  } catch (error) {
    console.error('❌ MCP test connection error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test Direct Figma API connection
 */
async function testDirectAPI(req, res) {
  try {
    const { figmaPersonalAccessToken } = req.body;
    
    if (!figmaPersonalAccessToken) {
      return res.json({
        success: false,
        error: 'Figma API token is required for direct API connection'
      });
    }
    
    // Test Figma API directly
    const response = await fetch('https://api.figma.com/v1/me', {
      headers: {
        'X-Figma-Token': figmaPersonalAccessToken
      }
    });
    
    if (!response.ok) {
      return res.json({
        success: false,
        error: `Figma API error: ${response.status} ${response.statusText}`
      });
    }
    
    const userData = await response.json();
    
    return res.json({
      success: true,
      message: `Direct Figma API connected successfully as ${userData.handle}`,
      data: {
        connected: true,
        user: userData
      }
    });
  } catch (error) {
    console.error('❌ Direct API test failed:', error);
    return res.json({
      success: false,
      error: `Direct API connection failed: ${error.message}`
    });
  }
}

/**
 * Test MCP Tools connection
 */
async function testMCPTools(req, res) {
  try {
    const { serverUrl, endpoint } = req.body;
    
    if (!serverUrl) {
      return res.json({
        success: false,
        error: 'MCP server URL is required for MCP tools connection'
      });
    }
    
    // Test connection to external MCP server
    const testUrl = `${serverUrl}${endpoint || '/health'}`;
    const response = await fetch(testUrl, {
      method: 'GET',
      timeout: 5000
    });
    
    if (!response.ok) {
      return res.json({
        success: false,
        error: `MCP tools server error: ${response.status} ${response.statusText}`
      });
    }
    
    return res.json({
      success: true,
      message: `MCP tools server connected successfully at ${testUrl}`,
      data: {
        connected: true,
        serverUrl: testUrl
      }
    });
  } catch (error) {
    console.error('❌ MCP tools test failed:', error);
    return res.json({
      success: false,
      error: `MCP tools connection failed: ${error.message}`
    });
  }
}

export default router;
