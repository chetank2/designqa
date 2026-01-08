/**
 * MCP Test Connection Routes
 * Separate endpoint for testing MCP connections
 */

import express from 'express';
import fetch from 'node-fetch';
import { RemoteMCPClient } from '../figma/RemoteMCPClient.js';

const router = express.Router();

/**
 * POST /api/mcp/test-connection
 * Test MCP connection based on method
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { method, serverUrl, endpoint } = req.body;
    
    // Removed: console.log('🔍 Testing MCP connection:', { method, serverUrl, endpoint, body: req.body });
    
    // Normalize method value (handle case variations and aliases)
    const normalizedMethod = method ? String(method).toLowerCase().trim() : null;
    
    // Removed: console.log('🔍 Normalized method:', normalizedMethod);
    
    switch (normalizedMethod) {
      case 'direct_api':
      case 'api':
      case 'figma-api':
        console.log('✅ Routing to testDirectAPI');
        return await testDirectAPI(req, res);
        
      case 'desktop':
      case 'local':
      case 'figma-desktop':
        // Removed: console.log('✅ Routing to testDesktopMCP');
        return await testDesktopMCP(req, res);
        
      case 'mcp_server_remote':
      case 'figma':
      case 'figma-cloud':
      case 'cloud':
      case 'remote':
        console.log('✅ Routing to testRemoteMCP');
        return await testRemoteMCP(req, res);
        
      default:
        console.error('❌ Unknown method:', { original: method, normalized: normalizedMethod, type: typeof method });
        return res.json({
          success: false,
          error: `Unknown connection method: ${method || 'undefined'}. Supported methods: api, desktop, figma.`
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
 * Test Desktop MCP connection
 */
async function testDesktopMCP(req, res) {
  try {
    // Removed: console.log('🖥️  Testing Desktop MCP connection...');
    
    // Check if we're in desktop environment
    const isDesktopEnvironment = 
      process.env.DEPLOYMENT_MODE === 'desktop' ||
      process.env.NODE_ENV === 'development';
    
    if (!isDesktopEnvironment) {
      return res.json({
        success: false,
        error: 'Desktop MCP is only available in desktop mode'
      });
    }
    
    // Try to discover Desktop MCP
    try {
      const { discoverMCPPort, isFigmaRunning } = await import('@designqa/mcp-client/discovery');
      
      const figmaRunning = await isFigmaRunning();
      if (!figmaRunning) {
        return res.json({
          success: false,
          error: 'Figma Desktop app is not running. Please start Figma to use Desktop MCP.'
        });
      }
      
      const discovery = await discoverMCPPort();
      if (!discovery.port) {
        return res.json({
          success: false,
          error: 'Could not find Figma MCP port. Ensure Dev Mode and the Figma MCP server are enabled.'
        });
      }
      
      // Try to connect
      const { DesktopMCPClient } = await import('@designqa/mcp-client');
      const client = new DesktopMCPClient({
        port: discovery.port,
        autoDiscover: true
      });
      
      return res.json({
        success: true,
        message: `Desktop MCP connected successfully on port ${discovery.port}!`,
        data: {
          connected: true,
          port: discovery.port
        }
      });
    } catch (error) {
      console.error('❌ Desktop MCP discovery failed:', error);
      const errorMsg = error.message || String(error);
      
      // Provide specific guidance based on error type
      if (errorMsg.includes('404') || errorMsg.includes('Unexpected server response')) {
        return res.json({
          success: false,
          error: 'MCP server found but not responding correctly. This may mean:\n• Figma MCP feature is not enabled or available\n• Wrong port detected\n• MCP server needs to be enabled in Figma Preferences\n\nNote: Figma MCP may require an Enterprise account or specific version.'
        });
      }
      
      return res.json({
        success: false,
        error: `Desktop MCP connection failed: ${errorMsg}`
      });
    }
  } catch (error) {
    console.error('❌ Desktop MCP test failed:', error);
    return res.json({
      success: false,
      error: `Desktop MCP test failed: ${error.message || String(error)}`
    });
  }
}

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
 * Test Figma Remote MCP connection
 */
async function testRemoteMCP(req, res) {
  try {
    const { figmaPersonalAccessToken } = req.body;
    const token = figmaPersonalAccessToken || process.env.FIGMA_API_KEY || process.env.FIGMA_TOKEN;

    if (!token) {
      return res.json({
        success: false,
        error: 'Figma API token is required for remote MCP connection'
      });
    }

    const remoteClient = new RemoteMCPClient({
      remoteUrl: process.env.FIGMA_MCP_URL || 'https://mcp.figma.com/mcp',
      figmaToken: token
    });

    const connected = await remoteClient.connect();

    if (connected) {
      return res.json({
        success: true,
        message: 'Figma Hosted MCP connected successfully!',
        data: {
          connected: true,
          remoteUrl: remoteClient.baseUrl
        }
      });
    }

    throw new Error('Failed to establish remote MCP session');
  } catch (error) {
    console.error('❌ Remote MCP test failed:', error);
    return res.json({
      success: false,
      error: `Remote MCP connection failed: ${error.message}`
    });
  }
}

export default router;
