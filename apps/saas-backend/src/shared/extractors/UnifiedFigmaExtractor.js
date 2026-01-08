/**
 * Unified Figma Extractor
 * Single interface for extracting Figma data from multiple sources
 */

import { figmaDataAdapter } from '../data-adapters/FigmaDataAdapter.js';
import { getDesignSystem } from '../../design-system/DesignSystemRegistry.js';

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

    // Load Design System if ID provided
    if (options.designSystemId) {
      const ds = getDesignSystem(options.designSystemId);
      if (ds) {
        // Removed: console.log(`🎨 Using Design System for extraction: ${ds.name}`);
        // Add to options so it propagates to data adapters
        options = { ...options, designSystem: ds };
      } else {
        console.warn(`⚠️ Design System not found: ${options.designSystemId}`);
      }
    }

    const extractionErrors = [];
    let methods = [...this.extractionMethods];

    // STRICT MODE ENFORCEMENT: prevent unnecessary fallbacks
    // If we know which mode we are in, only try that specific method first with a short timeout
    // to "fail fast", then fallback to API if allowed.

    // In Desktop/Electron local mode, prefer Desktop MCP
    const isDesktopMode =
      process.env.FIGMA_CONNECTION_MODE === 'desktop' ||
      process.env.RUNNING_IN_ELECTRON === 'true' ||
      options.mode === 'desktop';

    const allowRemoteMcp = options.allowRemoteMcp === true;
    const allowApiFallback =
      options.allowApiFallback === true ||
      !!options.apiKey ||
      !!process.env.FIGMA_API_KEY ||
      !!process.env.FIGMA_PERSONAL_ACCESS_TOKEN;

    if (isDesktopMode && !allowRemoteMcp) {
      // DESKTOP MODE: Only Desktop MCP + API Fallback
      methods = methods.filter(m => m.name === 'desktop-mcp' || (allowApiFallback && m.name === 'figma-api'));

      // Use appropriate timeout for Desktop MCP check.
      // If it's not running, we still want reasonable timeout for complex files.
      const desktopMethod = methods.find(m => m.name === 'desktop-mcp');
      if (desktopMethod) {
        // Use environment timeout or a reasonable default (don't fail too fast)
        const desktopTimeout = parseInt(process.env.FIGMA_EXTRACTION_TIMEOUT || '60000', 10);
        const originalExtract = desktopMethod.extract;
        desktopMethod.extract = (url, opts) => originalExtract(url, { ...opts, timeout: desktopTimeout });
      }
    } else if (!isDesktopMode) {
      // CLOUD/WEB MODE: No Desktop MCP.
      methods = methods.filter(m => m.name !== 'desktop-mcp');

      // Remote MCP requires OAuth user context; if we don't have a userId and no API key, fail fast.
      if (!options.userId && !allowApiFallback) {
        return {
          success: false,
          error: 'Figma is not connected. Provide an API key (API mode) or connect via OAuth (cloud mode).',
          data: null
        };
      }

      // If no OAuth context, skip remote MCP and go straight to API when available.
      if (!options.userId) {
        methods = methods.filter(m => m.name !== 'figma-mcp' && m.name !== 'framelink-mcp');
      }
    }

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
        process.stdout.write(`🔄 Attempting Figma extraction via ${method.name}\n`);

        // Use appropriate timeout for each method type
        // Desktop MCP: Use environment timeout (handled above in method wrapping)
        // Remote MCP: Use provided timeout since connection latency exists
        const methodTimeout = timeout;

        const rawData = await this.executeWithTimeout(
          method.extract(figmaUrl, options),
          methodTimeout,
          `${method.name} extraction timeout`
        );


        if (rawData) {
          const standardizedData = figmaDataAdapter.normalize(
            rawData,
            method.name,
            { figmaUrl, ...options }
          );

          process.stdout.write(`✅ Figma extraction successful via ${method.name}: ${standardizedData.components.length} components, ${standardizedData.colors.length} colors, ${standardizedData.typography.length} typography entries\n`);
          // console.log(`✅ Extraction successful via ${method.name}:`, {
          //   components: standardizedData.components.length,
          //   colors: standardizedData.colors.length,
          //   typography: standardizedData.typography.length
          // });

          // Return proper API response format
          return {
            success: true,
            data: standardizedData
          };
        }
      } catch (error) {
        const errorMessage = `${method.name} extraction failed: ${error.message}`;
        process.stdout.write(`⚠️ ${method.name} extraction failed: ${error.message}\n`);
        console.warn(`⚠️ ${errorMessage}`);
        extractionErrors.push({ method: method.name, error: errorMessage });

        if (!fallbackEnabled) {
          throw new Error(errorMessage);
        }
      }
    }

    // If all methods failed
    const errorSummary = extractionErrors.map(e => `${e.method}: ${e.error}`).join('; ');
    process.stdout.write(`❌ All Figma extraction methods failed\n`);
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
      // Use shared MCP client instance so we reuse the connection started at boot
      const { getMCPClient } = await import('../../config/mcp-config.js');
      const desktopClient = await getMCPClient({
        mode: 'desktop',
        autoDetectDesktop: true
      });

      if (!desktopClient) {
        throw new Error('Desktop MCP client not available. Ensure Figma Desktop is running with MCP enabled.');
      }

      // For the HTTP-based MCP client, connect() performs initialize + sets initialized.
      // For any legacy client, connect() should also establish a usable session.
      if (!desktopClient.initialized) {
        const connected = await desktopClient.connect();
        if (!connected && !desktopClient.initialized) {
          throw new Error('Cannot connect to Desktop MCP server');
        }
      }

      const callToolWithFallback = async (name, args) => {
        const attempts = [];
        const nodeIdRaw = args?.nodeId || args?.node_id || null;
        const fileKey = args?.fileKey || args?.file_key || null;
        const nodeIdCandidates = Array.from(
          new Set(
            [nodeIdRaw, nodeIdRaw && nodeIdRaw.includes(':') ? nodeIdRaw.replace(':', '-') : null]
              .filter(Boolean)
          )
        );
        const primaryNodeId = nodeIdCandidates[0] || null;

        // Attempt 1: as-is (some implementations accept camelCase)
        attempts.push({ ...args });

        // Attempt 2: file only (some tools infer node from active selection/tab)
        attempts.push({
          ...(fileKey ? { fileKey } : {})
        });

        // Attempt 3: snake_case (common for MCP tool schemas) with any node-id variants
        for (const candidate of nodeIdCandidates.length > 0 ? nodeIdCandidates : [null]) {
          attempts.push({
            ...(fileKey ? { file_key: fileKey } : {}),
            ...(candidate ? { node_id: candidate } : {})
          });
        }

        // Attempt 4: node only (some servers ignore file_key)
        for (const candidate of nodeIdCandidates.length > 0 ? nodeIdCandidates : [null]) {
          attempts.push({
            ...(candidate ? { node_id: candidate } : {})
          });
        }

        // Attempt 5: empty (some servers use current selection)
        attempts.push({});

        const isToolErrorResult = (result) => {
          const candidate = result?.result ?? result;
          if (!candidate || typeof candidate !== 'object') return false;
          if (candidate.isError === true) return true;
          const text = candidate?.content?.[0]?.text;
          if (typeof text === 'string' && text.toLowerCase().includes('no node could be found')) {
            return true;
          }
          return false;
        };

        let lastError;
        for (const attemptArgs of attempts) {
          try {
            const result = await desktopClient.callTool(name, attemptArgs);
            if (isToolErrorResult(result)) {
              const message =
                (result?.result ?? result)?.content?.[0]?.text ||
                'MCP tool returned an error';
              throw new Error(message);
            }
            return result;
          } catch (error) {
            lastError = error;
          }
        }

        // Provide a more actionable error for the common Desktop MCP "selection required" case.
        const baseMessage = lastError?.message || `Failed to call MCP tool: ${name}`;
        if (/An error occurred while using the tool/i.test(baseMessage)) {
          const nodeHint = primaryNodeId
            ? ` You provided node-id ${primaryNodeId}, but Desktop MCP often operates on the current selection.`
            : '';
          throw new Error(
            `${baseMessage}.${nodeHint} ` +
            `Tip: open the Figma file in the Desktop app, enable Dev Mode, and select the target frame/component before running extraction.`
          );
        }
        throw lastError || new Error(`Failed to call MCP tool: ${name}`);
      };

      // Extract data
      const fileId = this.parseFileId(figmaUrl);
      const nodeId = options.nodeId || this.parseNodeId(figmaUrl);

      if (!fileId) {
        throw new Error('Cannot extract file ID from Figma URL');
      }

      // Prefer a single "get_figma_data" tool if available; some servers don't list tools
      // reliably, so we will try it first even if it's not advertised.
      let toolNames = [];
      try {
        if (typeof desktopClient.listTools === 'function') {
          const toolsResult = await desktopClient.listTools();
          toolNames = toolsResult?.tools?.map(t => t.name).filter(Boolean) || [];
        }
      } catch {
        toolNames = [];
      }

      const hasTool = (name) => toolNames.includes(name);

      let metadata;
      let code;
      let variables;

      // Attempt get_figma_data first (best-effort), then fall back to the legacy trio.
      try {
        const figmaData = await callToolWithFallback('get_figma_data', { fileKey: fileId, nodeId });
        metadata = figmaData?.metadata || figmaData?.result?.metadata || figmaData;
        code = figmaData?.code || figmaData?.result?.code || null;
        variables = figmaData?.variables || figmaData?.result?.variables || null;
      } catch (e) {
        // Only fall back if it looks like the server supports the legacy tools.
        // If tools are not listed, we still try legacy trio since it's the only other option.
        if (toolNames.length > 0 && !(hasTool('get_metadata') || hasTool('get_variable_defs') || hasTool('get_code') || hasTool('get_design_context'))) {
          throw e;
        }
      }

      if (!metadata && !code && !variables) {
        // Use MCP tools to get structured data
        metadata = await callToolWithFallback('get_metadata', { fileKey: fileId, nodeId });
        variables = await callToolWithFallback('get_variable_defs', { fileKey: fileId, nodeId });

        // Some Desktop MCP servers don't provide get_code; fall back to get_design_context if available.
        if (hasTool('get_code')) {
          code = await callToolWithFallback('get_code', { fileKey: fileId, nodeId });
        } else if (hasTool('get_design_context')) {
          code = await callToolWithFallback('get_design_context', { fileKey: fileId, nodeId });
        } else {
          code = null;
        }
      }

      const rawMCPData = { metadata, code, variables };
      if (!rawMCPData.metadata && !rawMCPData.code && !rawMCPData.variables) {
        throw new Error('Desktop MCP extraction returned no data');
      }

      // If all three are error payloads, treat as a hard failure so callers can surface a clear message.
      const isErrorPayload = (v) => (v && typeof v === 'object' && v.isError === true);
      if (isErrorPayload(metadata) && isErrorPayload(code) && isErrorPayload(variables)) {
        const message = metadata?.content?.[0]?.text || 'Figma Desktop MCP could not resolve the requested node.';
        throw new Error(
          `Desktop MCP could not find the requested node. ${message} ` +
          `Tip: open the Figma file in the Desktop app and make it the active tab (or try without node-id to use current selection).`
        );
      }

      // Return in the structured format expected by MCPXMLAdapter (rawMCPData wrapper).
      return {
        rawMCPData,
        fileId,
        nodeId,
        extractedAt: new Date().toISOString(),
        // Keep original tool listing for debugging
        availableTools: toolNames
      };
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

        // Wrap in the expected format for MCPXMLAdapter
        mcpData = {
          rawMCPData: {
            metadata: metadata,
            code: code,
            variables: variables
          },
          fileId: fileId,
          nodeId: nodeId,
          metadata: {
            name: `Figma File ${fileId}`
          },
          extractedAt: new Date().toISOString()
        };
      }
    }

    if (!mcpData || (!mcpData.metadata && !mcpData.rawMCPData)) {
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

    // Removed: console.log(`📡 Making Figma API request to: ${apiUrl}`);

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
