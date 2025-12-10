/**
 * Proxy MCP Client (TypeScript)
 * Connects to the MCP Proxy service instead of directly to Figma MCP
 * The proxy handles WebSocket connections to Figma MCP and provides REST API endpoints
 */

import {
  IMCPClient,
  MCPClientConfig,
  MCPConnectionState,
  MCPInitializeParams,
  MCPTool,
  MCPToolResult,
  MCPConnectionError,
  MCPToolError
} from './MCPClient.js';

export interface ProxyMCPClientConfig extends MCPClientConfig {
  proxyUrl?: string;
}

export class ProxyMCPClient implements IMCPClient {
  private sessionId: string | null = null;
  public initialized = false;
  public connectionState: MCPConnectionState = MCPConnectionState.DISCONNECTED;
  
  private proxyUrl: string;
  private token: string | undefined;
  private config: ProxyMCPClientConfig;

  constructor(config: ProxyMCPClientConfig = {}) {
    this.config = config;
    this.proxyUrl = config.proxyUrl || process.env.MCP_PROXY_URL || 'https://mcp-proxy.onrender.com';
    this.token = config.figmaToken;
  }

  /**
   * Connect to MCP via proxy
   */
  async connect(): Promise<boolean> {
    try {
      this.connectionState = MCPConnectionState.CONNECTING;
      console.log(`🔄 Connecting to MCP via proxy: ${this.proxyUrl}`);

      if (!this.token) {
        throw new MCPConnectionError('Figma token required for MCP proxy connection', false);
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
        throw new MCPConnectionError(`Proxy session start failed: ${startResponse.status} - ${errorText}`, false);
      }

      const sessionData = await startResponse.json();
      this.sessionId = sessionData.sessionId;

      if (!this.sessionId) {
        throw new MCPConnectionError('Proxy did not return a session ID', false);
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
        console.warn('⚠️ Proxy connection test failed, but continuing...', testError);
      }

      this.initialized = true;
      this.connectionState = MCPConnectionState.CONNECTED;
      console.log('✅ MCP Proxy client connected successfully');

      // Step 3: List available tools
      try {
        const tools = await this.listTools();
        console.log('📋 Available MCP tools:', tools?.tools?.map(t => t.name) || []);
      } catch (toolsError) {
        console.warn('⚠️ Could not list tools:', toolsError);
      }

      return true;
    } catch (error) {
      this.connectionState = MCPConnectionState.ERROR;
      console.error(`❌ MCP Proxy connection failed to ${this.proxyUrl}:`, error);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Initialize MCP protocol handshake
   */
  async initialize(params?: MCPInitializeParams): Promise<void> {
    if (!this.initialized) {
      await this.connect();
    }
    // Proxy handles initialization internally
  }

  /**
   * Send a generic MCP request via proxy
   */
  private async sendRequest(method: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.sessionId) {
      throw new MCPConnectionError('Not connected to MCP proxy. Call connect() first.', false);
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
      throw new MCPConnectionError(`MCP proxy request failed: ${response.status} - ${errorText}`, false);
    }

    const data = await response.json();
    return data.result;
  }

  /**
   * List available MCP tools
   */
  async listTools(): Promise<{ tools: MCPTool[] }> {
    if (!this.initialized) {
      await this.connect();
    }

    const result = await this.sendRequest('tools/list', {});
    return result;
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName: string, args: Record<string, any> = {}): Promise<MCPToolResult> {
    if (!this.initialized) {
      await this.connect();
    }

    try {
      const result = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });
      return result;
    } catch (error) {
      if (error instanceof MCPToolError) {
        throw error;
      }
      throw new MCPToolError(`Tool call failed: ${error}`, toolName);
    }
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (this.sessionId) {
      this.sessionId = null;
      this.initialized = false;
      this.connectionState = MCPConnectionState.DISCONNECTED;
      console.log('🔌 MCP Proxy session closed');
    }
  }

  /**
   * Run comparison extraction (proxy-specific convenience method)
   */
  async runComparison(nodeId: string, fileKey: string | null = null): Promise<any> {
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
      throw new MCPConnectionError(`MCP comparison failed: ${response.status} - ${errorText}`, false);
    }

    return await response.json();
  }

  /**
   * Get Figma frame data (convenience method)
   */
  async getFrame(fileKey: string, nodeId?: string): Promise<any> {
    return this.callTool('get_figma_data', { fileKey, nodeId });
  }

  /**
   * Get Figma styles (convenience method)
   */
  async getStyles(fileKey: string): Promise<any> {
    return this.callTool('get_styles', { fileKey });
  }

  /**
   * Get Figma tokens/variables (convenience method)
   */
  async getTokens(fileKey: string, nodeId?: string): Promise<any> {
    return this.callTool('get_variable_defs', { fileKey, nodeId });
  }
}
