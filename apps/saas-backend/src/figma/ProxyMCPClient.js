/**
 * Proxy MCP Client
 * Connects to the MCP Proxy service instead of directly to Figma MCP
 * The proxy handles WebSocket connections to Figma MCP and provides REST API endpoints
 */

export class ProxyMCPClient {
  constructor(config = {}) {
    this.proxyUrl = config.proxyUrl || process.env.MCP_PROXY_URL || 'https://mcp-proxy.onrender.com';
    this.token = config.figmaToken;
    this.sessionId = null;
    this.initialized = false;
    this.config = config;
  }

  /**
   * Connect to MCP via proxy
   */
  async connect() {
    try {
      console.log(`🔄 Connecting to MCP via proxy: ${this.proxyUrl}`);

      if (!this.token) {
        throw new Error('Figma token required for MCP proxy connection');
      }

      // Step 1: Start a session with the proxy
      const startResponse = await fetch(`${this.proxyUrl}/mcp/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.config.userId || 'system',
          token: this.token
        })
      });

      if (!startResponse.ok) {
        const errorText = await startResponse.text();
        throw new Error(`Proxy session start failed: ${startResponse.status} - ${errorText}`);
      }

      const sessionData = await startResponse.json();
      this.sessionId = sessionData.sessionId;

      if (!this.sessionId) {
        throw new Error('Proxy did not return a session ID');
      }

      console.log(`🔑 MCP Proxy session established: ${this.sessionId}`);

      // Step 2: Test the connection
      try {
        const testResponse = await fetch(`${this.proxyUrl}/mcp/test`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: this.sessionId
          })
        });

        if (testResponse.ok) {
          const testData = await testResponse.json();
          console.log('✅ Proxy connection verified:', testData);
        }
      } catch (testError) {
        console.warn('⚠️ Proxy connection test failed, but continuing...', testError.message);
      }

      this.initialized = true;
      console.log('✅ MCP Proxy client connected successfully');

      // Step 3: List available tools
      try {
        const tools = await this.listTools();
        console.log('📋 Available MCP tools:', tools?.tools?.map(t => t.name) || []);
      } catch (toolsError) {
        console.warn('⚠️ Could not list tools:', toolsError.message);
      }

      return true;
    } catch (error) {
      console.error(`❌ MCP Proxy connection failed to ${this.proxyUrl}:`, error.message);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * List available MCP tools
   */
  async listTools() {
    if (!this.initialized) {
      await this.connect();
    }

    const result = await this.sendRequest('tools/list', {});
    return result;
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName, arguments_ = {}) {
    if (!this.initialized) {
      await this.connect();
    }

    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: arguments_
    });
    return result;
  }

  /**
   * Send a generic MCP request via proxy
   */
  async sendRequest(method, params = {}) {
    if (!this.sessionId) {
      throw new Error('Not connected to MCP proxy. Call connect() first.');
    }

    const response = await fetch(`${this.proxyUrl}/mcp/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: this.sessionId,
        method: method,
        params: params
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP proxy request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.result;
  }

  /**
   * Run comparison extraction (proxy-specific convenience method)
   */
  async runComparison(nodeId, fileKey = null) {
    if (!this.sessionId) {
      await this.connect();
    }

    const response = await fetch(`${this.proxyUrl}/mcp/compare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: this.sessionId,
        nodeId: nodeId,
        fileKey: fileKey
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP comparison failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Close the proxy session
   */
  async disconnect() {
    if (this.sessionId) {
      // Note: Proxy may not have a disconnect endpoint, but we can clear local state
      this.sessionId = null;
      this.initialized = false;
      console.log('🔌 MCP Proxy session closed');
    }
  }
}
