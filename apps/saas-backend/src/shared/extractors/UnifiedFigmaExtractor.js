/**
 * Unified Figma Extractor
 * Single interface for extracting Figma data from multiple sources
 */

import { figmaDataAdapter } from '../data-adapters/FigmaDataAdapter.js';

export class UnifiedFigmaExtractor {
  constructor(config = {}) {
    this.config = config;
    this.extractionMethods = [
      {
        name: 'desktop-mcp',
        extract: this.extractViaDesktopMCP.bind(this),
        priority: 0,
        description: 'Figma Desktop MCP (Local)'
      },
      {
        name: 'figma-mcp',
        extract: this.extractViaMCP.bind(this),
        priority: 1,
        description: 'Figma Dev Mode MCP Server'
      },
      {
        name: 'framelink-mcp',
        extract: this.extractViaFramelink.bind(this),
        priority: 2,
        description: 'Framelink MCP Tools'
      },
      {
        name: 'figma-api',
        extract: this.extractViaAPI.bind(this),
        priority: 3,
        description: 'Direct Figma REST API'
      }
    ];
  }

  /**
   * Extract Figma data using best available method
   * @param {string} figmaUrl - Figma URL
   * @param {Object} options - Extraction options
   * @returns {Promise<StandardizedFigmaData>}
   */
  async extract(figmaUrl, options = {}) {
    const { 
      preferredMethod = null,
      fallbackEnabled = true,
      timeout = 30000 
    } = options;

    const extractionErrors = [];
    let methods = [...this.extractionMethods];

    // If preferred method specified, try it first
    if (preferredMethod) {
      const preferred = methods.find(m => m.name === preferredMethod);
      if (preferred) {
        methods = [preferred, ...methods.filter(m => m.name !== preferredMethod)];
      }
    }

    // Sort by priority (lower number = higher priority)
    methods.sort((a, b) => a.priority - b.priority);

    for (const method of methods) {
      try {
        console.log(`🔄 Attempting extraction via ${method.name} (${method.description})`);
        
        const rawData = await this.executeWithTimeout(
          method.extract(figmaUrl, options),
          timeout,
          `${method.name} extraction timeout`
        );

        if (rawData) {
          const standardizedData = figmaDataAdapter.normalize(
            rawData,
            method.name,
            { figmaUrl, ...options }
          );

          console.log(`✅ Extraction successful via ${method.name}:`, {
            components: standardizedData.components.length,
            colors: standardizedData.colors.length,
            typography: standardizedData.typography.length
          });

          // Return proper API response format
          return {
            success: true,
            data: standardizedData
          };
        }
      } catch (error) {
        const errorMessage = `${method.name} extraction failed: ${error.message}`;
        console.warn(`⚠️ ${errorMessage}`);
        extractionErrors.push({ method: method.name, error: errorMessage });

        if (!fallbackEnabled) {
          throw new Error(errorMessage);
        }
      }
    }

    // If all methods failed
    const errorSummary = extractionErrors.map(e => `${e.method}: ${e.error}`).join('; ');
    return {
      success: false,
      error: `All extraction methods failed. Errors: ${errorSummary}`,
      data: null
    };
  }

  /**
   * Extract via Desktop MCP (Local WebSocket)
   * @param {string} figmaUrl - Figma URL
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>}
   */
  async extractViaDesktopMCP(figmaUrl, options = {}) {
    try {
      // Check if Desktop MCP is available
      const { DesktopMCPClient } = await import('@designqa/mcp-client');
      const { discoverMCPPort, isFigmaRunning } = await import('@designqa/mcp-client/discovery');

      const figmaRunning = await isFigmaRunning();
      if (!figmaRunning) {
        throw new Error('Figma Desktop app is not running');
      }

      const discovery = await discoverMCPPort();
      if (!discovery.port) {
        throw new Error('Desktop MCP port not found');
      }

      // Create DesktopMCPClient
      const desktopClient = new DesktopMCPClient({
        port: discovery.port,
        autoDiscover: false
      });

      // Connect and initialize
      await desktopClient.connect();
      await desktopClient.initialize();

      // Extract data
      const fileId = this.parseFileId(figmaUrl);
      const nodeId = options.nodeId || this.parseNodeId(figmaUrl);

      if (!fileId) {
        throw new Error('Cannot extract file ID from Figma URL');
      }

      // Use MCP tools to get data
      const metadata = await desktopClient.callTool('get_metadata', { fileKey: fileId, nodeId });
      const code = await desktopClient.callTool('get_code', { fileKey: fileId, nodeId });
      const variables = await desktopClient.callTool('get_variable_defs', { fileKey: fileId, nodeId });

      const mcpData = {
        metadata: metadata,
        code: code,
        variables: variables,
        fileKey: fileId,
        nodeId: nodeId
      };

      // Disconnect
      await desktopClient.disconnect();

      if (!mcpData || !mcpData.metadata) {
        throw new Error('Desktop MCP extraction returned no data');
      }

      return mcpData;
    } catch (error) {
      // If desktop MCP fails, throw error to trigger fallback
      throw new Error(`Desktop MCP extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract via Figma Dev Mode MCP (Remote/Proxy)
   * @param {string} figmaUrl - Figma URL
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>}
   */
  async extractViaMCP(figmaUrl, options = {}) {
    // Use the configured MCP client (supports Proxy, Remote, or Local)
    const { getMCPClient } = await import('../../config/mcp-config.js');
    
    const mcpClient = await getMCPClient({
      userId: options.userId,
      figmaToken: options.apiKey,
      mode: 'figma'
    });
    
    if (!mcpClient) {
      throw new Error('MCP client not available. Check MCP configuration.');
    }
    
    // Try to connect if not already connected
    if (!mcpClient.initialized) {
      const isConnected = await mcpClient.connect();
      if (!isConnected) {
        throw new Error('Cannot connect to Figma MCP server');
      }
    }

    // Extract data - handle different client types
    let mcpData;
    
    // Check if client has extractFigmaData method (legacy FigmaMCPClient)
    if (typeof mcpClient.extractFigmaData === 'function') {
      mcpData = await mcpClient.extractFigmaData(figmaUrl);
    } else {
      // For ProxyMCPClient or RemoteMCPClient, extract via proxy/API
      const fileId = this.parseFileId(figmaUrl);
      const nodeId = options.nodeId || this.parseNodeId(figmaUrl);
      
      if (!fileId) {
        throw new Error('Cannot extract file ID from Figma URL');
      }
      
      // Use proxy comparison endpoint if available
      if (typeof mcpClient.runComparison === 'function') {
        mcpData = await mcpClient.runComparison(nodeId, fileId);
      } else {
        // Fallback: use MCP tools directly
        const metadata = await mcpClient.callTool('get_metadata', { nodeId, fileKey: fileId });
        const code = await mcpClient.callTool('get_code', { nodeId, fileKey: fileId });
        const variables = await mcpClient.callTool('get_variable_defs', { nodeId, fileKey: fileId });
        
        mcpData = {
          metadata: metadata,
          code: code,
          variables: variables,
          fileKey: fileId,
          nodeId: nodeId
        };
      }
    }
    
    if (!mcpData || !mcpData.metadata) {
      throw new Error('MCP extraction returned no data');
    }

    return mcpData; // Return the full MCP data structure for adapter processing
  }

  /**
   * Extract via Framelink MCP
   * @param {string} figmaUrl - Figma URL
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>}
   */
  async extractViaFramelink(figmaUrl, options = {}) {
    // Check if Framelink MCP tools are available
    if (typeof globalThis.mcp_Framelink_Figma_MCP_get_figma_data !== 'function') {
      throw new Error('Framelink MCP tools not available');
    }

    const fileId = this.parseFileId(figmaUrl);
    const nodeId = options.nodeId || this.parseNodeId(figmaUrl);

    if (!fileId) {
      throw new Error('Cannot extract file ID from Figma URL');
    }

    const framelinkData = await globalThis.mcp_Framelink_Figma_MCP_get_figma_data({
      fileKey: fileId,
      nodeId: nodeId || undefined
    });

    if (!framelinkData) {
      throw new Error('Framelink MCP extraction returned no data');
    }

    return framelinkData;
  }

  /**
   * Extract via direct Figma API
   * @param {string} figmaUrl - Figma URL
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>}
   */
  async extractViaAPI(figmaUrl, options = {}) {
    const fileId = this.parseFileId(figmaUrl);
    const nodeId = options.nodeId || this.parseNodeId(figmaUrl);

    if (!fileId) {
      throw new Error('Cannot extract file ID from Figma URL');
    }

    // Get API key from config or options
    const apiKey = options.apiKey || 
                   this.config.get?.('figmaApiKey') || 
                   process.env.FIGMA_API_KEY;

    if (!apiKey) {
      throw new Error('Figma API key not available');
    }

    // Construct API URL
    let apiUrl = `https://api.figma.com/v1/files/${fileId}`;
    if (nodeId) {
      apiUrl += `/nodes?ids=${encodeURIComponent(nodeId)}`;
    }

    console.log(`📡 Making Figma API request to: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: {
        'X-Figma-Token': apiKey
      },
      signal: AbortSignal.timeout(options.timeout || 30000)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Figma API error: ${errorData.err || response.statusText}`);
    }

    const figmaData = await response.json();
    
    if (!figmaData) {
      throw new Error('Figma API returned no data');
    }

    return figmaData;
  }

  /**
   * Execute promise with timeout
   * @param {Promise} promise - Promise to execute
   * @param {number} timeout - Timeout in milliseconds
   * @param {string} timeoutMessage - Error message for timeout
   * @returns {Promise}
   */
  async executeWithTimeout(promise, timeout, timeoutMessage) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(timeoutMessage)), timeout);
      })
    ]);
  }

  /**
   * Parse file ID from Figma URL
   * @param {string} url - Figma URL
   * @returns {string|null}
   */
  parseFileId(url) {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      const pathMatch = urlObj.pathname.match(/\/(?:file|design)\/([a-zA-Z0-9]+)/);
      return pathMatch ? pathMatch[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Parse node ID from Figma URL
   * @param {string} url - Figma URL
   * @returns {string|null}
   */
  parseNodeId(url) {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      let nodeId = urlObj.searchParams.get('node-id');
      if (nodeId) {
        nodeId = decodeURIComponent(nodeId);
        // Convert hyphen format (5607-29953) to colon format (5607:29953) for Figma API
        return nodeId.replace('-', ':');
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get available extraction methods
   * @returns {Array}
   */
  getAvailableMethods() {
    return this.extractionMethods.map(method => ({
      name: method.name,
      description: method.description,
      priority: method.priority
    }));
  }

  /**
   * Test connectivity for all extraction methods
   * @returns {Promise<Object>}
   */
  async testConnectivity() {
    const results = {};

    for (const method of this.extractionMethods) {
      try {
        switch (method.name) {
          case 'figma-mcp':
            const FigmaMCPClient = (await import('../../figma/mcpClient.js')).default;
            const mcpClient = new FigmaMCPClient();
            results[method.name] = await mcpClient.connect();
            break;

          case 'framelink-mcp':
            results[method.name] = typeof globalThis.mcp_Framelink_Figma_MCP_get_figma_data === 'function';
            break;

          case 'figma-api':
            const apiKey = this.config.get?.('figmaApiKey') || process.env.FIGMA_API_KEY;
            results[method.name] = !!apiKey;
            break;

          default:
            results[method.name] = false;
        }
      } catch (error) {
        results[method.name] = false;
      }
    }

    return results;
  }
}
