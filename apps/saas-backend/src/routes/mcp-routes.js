/**
 * MCP API Routes
 * Exposes Figma MCP functionality via REST API
 * Note: For cloud deployments, use Remote MCP (getMCPClient with mode='figma')
 */

import express from 'express';
import { getMCPClient } from '../config/mcp-config.js';

const router = express.Router();

/**
 * GET /api/mcp/status
 * Get MCP connection status
 * In Electron/local mode, checks Electron MCP bridge
 */
router.get('/status', async (req, res) => {
  try {
    // Check if we're in Electron/local mode
    const isLocalMode = process.env.RUNNING_IN_ELECTRON === 'true' || 
                        (!process.env.RENDER && !process.env.VERCEL);

    if (isLocalMode) {
      // In Electron, MCP is managed by Electron bridge
      // First try to get bridge client from process global
      let bridgeClient = null;
      if (process.__designqa_mcp_bridge_client) {
        bridgeClient = process.__designqa_mcp_bridge_client;
        // Removed: console.log('[MCP Status] Found bridge client via process global');
      }
      
      // If no bridge client, try to get MCP client (which will use bridge if available)
      if (!bridgeClient) {
        try {
          const mcpClient = await getMCPClient({ mode: 'desktop', autoDetectDesktop: false });
          bridgeClient = mcpClient;
        } catch (error) {
          console.warn('[MCP Status] Failed to get MCP client:', error.message);
        }
      }
      
      if (!bridgeClient) {
        return res.json({
          success: false,
          status: 'disconnected',
          available: false,
          message: 'Desktop MCP not initialized. Ensure Figma Desktop is running and MCP bridge is connected.',
          data: {
            connected: false,
            serverUrl: null,
            port: null,
            tools: [],
            toolsCount: 0
          }
        });
      }

      // Protocol-agnostic connection check:
      // - HTTP/SSE clients expose connect() + initialized + baseUrl
      // - Legacy websocket clients expose ws + initialized
      let isConnected = false;
      let isInitialized = !!bridgeClient.initialized;

      try {
        if (typeof bridgeClient.connect === 'function') {
          const connectResult = await bridgeClient.connect();
          isInitialized = !!bridgeClient.initialized || !!connectResult;
        }
      } catch (error) {
        isInitialized = false;
      }

      const ws = bridgeClient.ws || null;
      const wsOpen = ws && typeof ws.readyState !== 'undefined' && ws.readyState === 1; // WebSocket.OPEN

      // Connected if initialized and (either no ws (HTTP client) or ws is open)
      isConnected = isInitialized && (!ws || wsOpen);

      const serverUrl = bridgeClient.baseUrl || bridgeClient.remoteUrl || process.env.FIGMA_DESKTOP_MCP_URL || null;
      const portFromEnv = process.env.FIGMA_MCP_PORT ? parseInt(process.env.FIGMA_MCP_PORT, 10) : null;
      const mcpPort = bridgeClient.port || portFromEnv || 3845;

      let tools = [];
      if (isConnected && typeof bridgeClient.listTools === 'function') {
        try {
          const toolResult = await bridgeClient.listTools();
          tools = toolResult?.tools?.map(t => t.name).filter(Boolean) || [];
        } catch (error) {
          tools = [];
        }
      }

      return res.json({
        success: true,
        status: isConnected ? 'connected' : 'disconnected',
        available: isConnected,
        message: isConnected
          ? `✅ Connected to Figma Desktop MCP on port ${mcpPort}`
          : 'Desktop MCP not connected. Ensure Figma Desktop is running.',
        data: {
          connected: isConnected,
          serverUrl,
          port: mcpPort,
          figmaRunning: isConnected,
          initialized: isInitialized,
          wsReadyState: ws ? ws.readyState : null,
          tools,
          toolsCount: tools.length
        }
      });
    }

    // Cloud mode - use remote MCP
    const mcpClient = await getMCPClient({ userId: req.user?.id });

    if (!mcpClient) {
      return res.json({
        success: false,
        status: 'disabled',
        available: false,
        message: 'MCP is disabled (API-only mode)',
        data: {
          connected: false,
          serverUrl: null,
          tools: [],
          toolsCount: 0
        }
      });
    }

    // Test connection to get current status
    const isConnected = await mcpClient.connect();

      res.json({
        success: true,
        status: isConnected ? 'connected' : 'disconnected',
        available: isConnected,
        message: isConnected
          ? 'MCP Server connected successfully'
          : 'MCP Server not available',
        data: {
          connected: isConnected,
          serverUrl: mcpClient.baseUrl || mcpClient.remoteUrl || 'https://mcp.figma.com/mcp',
          figmaRunning: isConnected,
          tools: isConnected ? ['get_code', 'get_metadata', 'get_variable_defs'] : [],
          toolsCount: isConnected ? 3 : 0
        }
      });
  } catch (error) {
    console.error('❌ MCP status error:', error);
    res.json({
      success: false,
      status: 'error',
      available: false,
      message: `MCP connection failed: ${error.message}`,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/figma/file
 * Get Figma file data
 */
router.post('/figma/file', async (req, res) => {
  try {
    const { fileId, nodeId } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    const mcpClient = await getMCPClient({ userId: req.user?.id });
    if (!mcpClient) {
      return res.status(400).json({
        success: false,
        error: 'MCP is disabled (API-only mode)'
      });
    }
    await mcpClient.connect();
    const data = await mcpClient.getFigmaFile(fileId, nodeId);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('❌ Figma file error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/figma/export
 * Export Figma assets
 */
router.post('/figma/export', async (req, res) => {
  try {
    const { fileId, nodeIds, format = 'png', scale = 2 } = req.body;

    if (!fileId || !nodeIds || !Array.isArray(nodeIds)) {
      return res.status(400).json({
        success: false,
        error: 'fileId and nodeIds array are required'
      });
    }

    const mcpClient = await getMCPClient({ userId: req.user?.id });
    if (!mcpClient) {
      return res.status(400).json({
        success: false,
        error: 'MCP is disabled (API-only mode)'
      });
    }
    await mcpClient.connect();
    const data = await mcpClient.exportAssets(fileId, nodeIds, format, scale);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('❌ Figma export error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/figma/analyze
 * Analyze Figma components
 */
router.post('/figma/analyze', async (req, res) => {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    const mcpClient = await getMCPClient({ userId: req.user?.id });
    if (!mcpClient) {
      return res.status(400).json({
        success: false,
        error: 'MCP is disabled (API-only mode)'
      });
    }
    await mcpClient.connect();
    const data = await mcpClient.analyzeComponents(fileId);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('❌ Figma analyze error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/figma/compare
 * Compare Figma design with web implementation using MCP
 */
router.post('/figma/compare', async (req, res) => {
  try {
    const { fileId, nodeId, webUrl } = req.body;

    if (!fileId || !webUrl) {
      return res.status(400).json({
        success: false,
        error: 'fileId and webUrl are required'
      });
    }

    const mcpClient = await getMCPClient({ userId: req.user?.id });
    if (!mcpClient) {
      return res.status(400).json({
        success: false,
        error: 'MCP is disabled (API-only mode)'
      });
    }
    await mcpClient.connect();

    // Get Figma data via MCP
    const figmaData = await mcpClient.getFigmaFile(fileId, nodeId);

    // Analyze components via MCP
    const componentAnalysis = await mcpClient.analyzeComponents(fileId);

    // TODO: Integrate with existing web extraction and comparison logic
    // For now, return the MCP data
    const result = {
      figma: {
        file: figmaData,
        analysis: componentAnalysis
      },
      web: {
        url: webUrl,
        // TODO: Add web extraction results
      },
      comparison: {
        // TODO: Add comparison results
        status: 'mcp_integration_ready'
      }
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Figma compare error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Note: MCP clients are created per request, so no global cleanup needed
// Each request handler manages its own client lifecycle

export default router;
