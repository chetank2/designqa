/**
 * Remote MCP Client (TypeScript)
 * HTTPS-based MCP connector for SaaS deployments
 * Connects to Figma's remote MCP service (https://mcp.figma.com/mcp)
 */

import {
  IMCPClient,
  MCPClientConfig,
  MCPConnectionState,
  MCPInitializeParams,
  MCPTool,
  MCPToolResult,
  MCPConnectionError,
  MCPAuthenticationError,
  MCPToolError
} from './MCPClient.js';

export interface RemoteMCPClientConfig extends MCPClientConfig {
  remoteUrl?: string;
}

export class RemoteMCPClient implements IMCPClient {
  private messageId = 0;
  private sessionId: string | null = null;
  public initialized = false;
  public connectionState: MCPConnectionState = MCPConnectionState.DISCONNECTED;
  
  private baseUrl: string;
  private token: string | undefined;
  private tokenProvider?: () => Promise<string | null>;
  private userId?: string;
  private config: RemoteMCPClientConfig;

  constructor(config: RemoteMCPClientConfig = {}) {
    this.config = config;
    this.baseUrl = config.remoteUrl || 'https://mcp.figma.com/mcp';
    this.token = config.figmaToken;
    this.tokenProvider = config.tokenProvider;
    this.userId = config.userId;
  }

  private async getToken(): Promise<string | null> {
    if (this.tokenProvider) {
      return await this.tokenProvider();
    }
    return this.token || null;
  }

  /**
   * Connect to remote MCP service
   */
  async connect(): Promise<boolean> {
    try {
      this.connectionState = MCPConnectionState.CONNECTING;
      console.log('🔄 Connecting to remote Figma MCP...');

      const token = await this.getToken();

      if (!token) {
        throw new MCPAuthenticationError('Figma token required for remote MCP connection');
      }

      // Step 1: Initialize with authentication
      const initResponse = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': `Bearer ${token}`
        },
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
        if (initResponse.status === 401) {
          throw new MCPAuthenticationError(`Authentication failed: ${errorText}`);
        }
        throw new MCPConnectionError(`Initialize failed: ${initResponse.status} - ${errorText}`, false);
      }

      // Get session ID from headers
      this.sessionId = initResponse.headers.get('mcp-session-id');
      if (!this.sessionId && initResponse.ok) {
        this.sessionId = `remote_${Date.now()}`;
      }

      console.log('🔑 Remote MCP session established');

      // Consume the initialize response
      await initResponse.text();

      // Step 2: Send initialized notification
      try {
        const notifyResponse = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': `Bearer ${token}`,
            ...(this.sessionId && { 'mcp-session-id': this.sessionId })
          },
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
        console.log('⚠️ Initialized notification failed, but continuing...', notifyError);
      }

      this.initialized = true;
      this.connectionState = MCPConnectionState.CONNECTED;
      console.log('✅ Remote MCP client connected successfully');

      // Step 3: List available tools
      try {
        const tools = await this.listTools();
        console.log('📋 Available remote MCP tools:', tools?.tools?.map(t => t.name) || []);
      } catch (toolsError) {
        console.warn('⚠️ Could not list tools:', toolsError);
      }

      return true;
    } catch (error) {
      this.connectionState = MCPConnectionState.ERROR;
      console.error(`❌ Remote connection failed to ${this.baseUrl}:`, error);
      if (error instanceof MCPAuthenticationError) {
        console.error('ℹ️  Tip: Check your FIGMA_MCP_SERVICE_TOKEN or FIGMA_MCP_URL environment variables.');
        console.error('   Current URL:', this.baseUrl);
      }
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
    // Already initialized in connect()
  }

  /**
   * Send request with authentication
   */
  private async sendRequest(request: any, retryCount = 0): Promise<any> {
    if (!this.initialized) {
      await this.connect();
    }

    try {
      console.log(`🔧 Sending remote request: ${request.method}`);

      const token = await this.getToken();

      if (!token) {
        throw new MCPAuthenticationError('Figma token required for remote MCP connection');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`
      };

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
          console.log('🔄 Received 401, attempting token refresh...');
          
          try {
            const newToken = await this.tokenProvider();
            
            if (newToken && newToken !== token) {
              console.log('✅ Token refreshed, retrying request...');
              this.token = newToken;
              return this.sendRequest(request, retryCount + 1);
            } else {
              throw new Error('Token refresh did not return a new token');
            }
          } catch (refreshError) {
            console.error('❌ Token refresh failed:', refreshError);
            throw new MCPAuthenticationError(`Authentication failed: Token expired and refresh failed. Please reconnect to Figma. Original error: HTTP ${response.status}: ${errorText}`);
          }
        }
        
        if (response.status === 401) {
          throw new MCPAuthenticationError(`HTTP ${response.status}: ${errorText}`);
        }
        throw new MCPConnectionError(`HTTP ${response.status}: ${errorText}`, false);
      }

      // Parse SSE response
      const responseText = await response.text();
      const result = this.parseSSEResponse(responseText);

      if (result.error) {
        throw new MCPToolError(`MCP Error: ${result.error.message}`, request.method);
      }

      console.log(`✅ Remote request ${request.method} successful`);
      return result.result;

    } catch (error) {
      console.error(`❌ Remote request ${request.method} failed:`, error);
      throw error;
    }
  }

  /**
   * Parse SSE (Server-Sent Events) response
   */
  private parseSSEResponse(text: string): any {
    if (text.trim().startsWith('{')) {
      try {
        return JSON.parse(text);
      } catch (e) {
        // Fall through to SSE parsing
      }
    }

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
  async listTools(): Promise<{ tools: MCPTool[] }> {
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
  async callTool(toolName: string, args: Record<string, any> = {}): Promise<MCPToolResult> {
    try {
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
    this.initialized = false;
    this.connectionState = MCPConnectionState.DISCONNECTED;
    this.sessionId = null;
    console.log('🔌 Remote MCP client disconnected');
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
