/**
 * Remote Figma MCP Client
 * HTTPS-based MCP connector for SaaS deployments
 * Connects to Figma's remote MCP service (https://mcp.figma.com/mcp)
 */

export class RemoteMCPClient {
  constructor(config = {}) {
    this.messageId = 0;
    this.sessionId = null;
    this.initialized = false;
    this.baseUrl = config.remoteUrl || 'https://mcp.figma.com/mcp';

    // Support both static token and dynamic provider
    this.token = config.figmaToken;
    this.tokenProvider = config.tokenProvider; // async () => token
    this.userId = config.userId;

    // Allow unauthenticated connections (used for Figma Desktop MCP on localhost)
    this.requireToken = config.requireToken !== undefined ? config.requireToken : true;

    this.config = config;
  }

  async getToken() {
    if (this.tokenProvider) {
      return await this.tokenProvider();
    }
    return this.token;
  }

  /**
   * Connect to remote MCP service
   */
  async connect() {
    try {
      // Removed: console.log('🔄 Connecting to remote Figma MCP...');

      const token = await this.getToken();

      if (!token && this.requireToken) {
        throw new Error('Figma token required for remote MCP connection');
      }

      // Step 1: Initialize with authentication
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const initResponse = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.messageId,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
              resources: { subscribe: true }
            },
            clientInfo: {
              name: "figma-comparison-tool",
              version: "1.0.0"
            }
          }
        })
      });

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        throw new Error(`Initialize failed: ${initResponse.status} - ${errorText}`);
      }

      // Get session ID from headers
      this.sessionId = initResponse.headers.get('mcp-session-id');
      if (!this.sessionId && initResponse.ok) {
        // Some implementations may not use session IDs for stateless HTTPS
        this.sessionId = `remote_${Date.now()}`;
      }

      // Removed: console.log('🔑 Remote MCP session established');

      // Consume the initialize response
      await initResponse.text();

      // Step 2: Send initialized notification
      try {
        const notifyHeaders = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          ...(this.sessionId && { 'mcp-session-id': this.sessionId })
        };
        if (token) {
          notifyHeaders['Authorization'] = `Bearer ${token}`;
        }

        const notifyResponse = await fetch(this.baseUrl, {
          method: 'POST',
          headers: notifyHeaders,
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
            params: {}
          })
        });

        if (notifyResponse.ok) {
          await notifyResponse.text();
          console.log('✅ Initialized notification sent');
        }
      } catch (notifyError) {
        console.log('⚠️ Initialized notification failed, but continuing...', notifyError.message);
      }

      this.initialized = true;
      // Removed: console.log('✅ Remote MCP client connected successfully');

      // Step 3: List available tools
      try {
        const tools = await this.listTools();
        // Removed: console.log('📋 Available remote MCP tools:', tools?.tools?.map(t => t.name) || []);
      } catch (toolsError) {
        console.warn('⚠️ Could not list tools:', toolsError.message);
      }

      return true;
    } catch (error) {
      console.error(`❌ Remote connection failed to ${this.baseUrl}:`, error.message);
      if (error.message.includes('401')) {
        console.error('ℹ️  Tip: Check your FIGMA_MCP_SERVICE_TOKEN or FIGMA_MCP_URL environment variables.');
        console.error('   Current URL:', this.baseUrl);
      }
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Send request with authentication
   * Handles 401 errors by attempting token refresh and retry
   */
  async sendRequest(request, retryCount = 0) {
    if (!this.initialized) {
      await this.connect();
    }

    try {
      // Removed: console.log(`🔧 Sending remote request: ${request.method}`);

      const token = await this.getToken();

      if (!token && this.requireToken) {
        throw new Error('Figma token required for remote MCP connection');
      }

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Add session ID if available
      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle 401 Unauthorized - try token refresh if provider available
        if (response.status === 401 && this.tokenProvider && retryCount === 0) {
          // Removed: console.log('🔄 Received 401, attempting token refresh...');
          
          try {
            // Get fresh token from provider (will trigger refresh if needed)
            const newToken = await this.tokenProvider();
            
            if (newToken && newToken !== token) {
              console.log('✅ Token refreshed, retrying request...');
              // Update token and retry once
              this.token = newToken;
              return this.sendRequest(request, retryCount + 1);
            } else {
              throw new Error('Token refresh did not return a new token');
            }
          } catch (refreshError) {
            console.error('❌ Token refresh failed:', refreshError.message);
            throw new Error(`Authentication failed: Token expired and refresh failed. Please reconnect to Figma. Original error: HTTP ${response.status}: ${errorText}`);
          }
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Parse SSE response
      const responseText = await response.text();
      const result = this.parseSSEResponse(responseText);

      if (result.error) {
        throw new Error(`MCP Error: ${result.error.message}`);
      }

      // Removed: console.log(`✅ Remote request ${request.method} successful`);
      return result.result;

    } catch (error) {
      console.error(`❌ Remote request ${request.method} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Parse SSE (Server-Sent Events) response
   */
  parseSSEResponse(text) {
    // Handle JSON response (non-SSE)
    if (text.trim().startsWith('{')) {
      try {
        return JSON.parse(text);
      } catch (e) {
        // Fall through to SSE parsing
      }
    }

    // Parse SSE format
    const lines = text.split('\n');
    let result = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.id !== undefined) {
            result = data;
          }
        } catch (e) {
          // Continue parsing
        }
      }
    }

    if (!result) {
      // Fallback: try to parse entire text as JSON
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error('Failed to parse MCP response');
      }
    }

    return result;
  }

  /**
   * List available tools
   */
  async listTools() {
    const result = await this.sendRequest({
      jsonrpc: "2.0",
      id: ++this.messageId,
      method: "tools/list",
      params: {}
    });
    return result;
  }

  /**
   * Call a tool
   */
  async callTool(toolName, args = {}) {
    const result = await this.sendRequest({
      jsonrpc: "2.0",
      id: ++this.messageId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args
      }
    });
    return result;
  }

  /**
   * Get Figma file data
   */
  async getFigmaFile(fileKey, nodeId = null) {
    const args = { fileKey };
    if (nodeId) {
      args.nodeId = nodeId;
    }
    return await this.callTool('get_figma_data', args);
  }

  /**
   * Analyze components
   */
  async analyzeComponents(fileKey) {
    return await this.callTool('analyze_components', { fileKey });
  }

  /**
   * Export assets
   */
  async exportAssets(fileKey, nodeIds, format = 'png', scale = 2) {
    return await this.callTool('export_assets', {
      fileKey,
      nodeIds,
      format,
      scale
    });
  }

  /**
   * Disconnect
   */
  async disconnect() {
    this.initialized = false;
    this.sessionId = null;
    // Removed: console.log('🔌 Remote MCP client disconnected');
  }
}
