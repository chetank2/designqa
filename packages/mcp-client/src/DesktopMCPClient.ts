/**
 * Desktop MCP Client
 * Connects to Figma Desktop App's local MCP server via WebSocket
 */

import WebSocket from 'ws';
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
import { discoverMCPPort, isFigmaRunning } from './discovery/index.js';

export interface DesktopMCPClientConfig extends MCPClientConfig {
  port?: number;
  autoDiscover?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class DesktopMCPClient implements IMCPClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  
  public initialized = false;
  public connectionState: MCPConnectionState = MCPConnectionState.DISCONNECTED;
  
  private config: DesktopMCPClientConfig;
  private port: number | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectInterval: number;

  constructor(config: DesktopMCPClientConfig = {}) {
    this.config = config;
    this.port = config.port || null;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
    this.reconnectInterval = config.reconnectInterval || 3000;
  }

  /**
   * Discover MCP port if not provided
   */
  private async discoverPort(): Promise<number> {
    if (this.port) {
      return this.port;
    }

    if (this.config.autoDiscover !== false) {
      const discovery = await discoverMCPPort();
      if (discovery.port) {
        this.port = discovery.port;
        return discovery.port;
      }
    }

    // Default port
    return 3845;
  }

  /**
   * Connect to Desktop MCP server via WebSocket
   */
  async connect(): Promise<boolean> {
    if (this.connectionState === MCPConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN) {
      return true;
    }

    try {
      this.connectionState = MCPConnectionState.CONNECTING;
      
      // Check if Figma is running
      const figmaRunning = await isFigmaRunning();
      if (!figmaRunning) {
        throw new MCPConnectionError('Figma Desktop app is not running', true);
      }

      // Discover port if needed
      const port = await this.discoverPort();
      const wsUrl = `ws://127.0.0.1:${port}`;

      console.log(`🔄 Connecting to Desktop MCP at ${wsUrl}...`);
      console.log(`[MCP] Mode: Desktop (Local), Port: ${port}, URL: ${wsUrl}`);

      // Add small delay to ensure Figma MCP server is ready
      await new Promise(resolve => setTimeout(resolve, 500));

      return new Promise((resolve, reject) => {
        try {
          this.ws = new WebSocket(wsUrl);

          this.ws.on('open', () => {
            console.log('✅ Desktop MCP WebSocket connected');
            console.log('✅ Connected to Figma Desktop MCP on 3845');
            this.connectionState = MCPConnectionState.CONNECTED;
            this.reconnectAttempts = 0;
            this.initialized = false; // Will be set after initialize()
            resolve(true);
          });

          this.ws.on('message', (data: WebSocket.Data) => {
            this.handleMessage(data.toString());
          });

          this.ws.on('error', (error: Error) => {
            console.error('❌ Desktop MCP WebSocket error:', error);
            this.connectionState = MCPConnectionState.ERROR;
            reject(new MCPConnectionError(`WebSocket error: ${error.message}`, true));
          });

          this.ws.on('close', (code: number, reason: Buffer) => {
            console.log(`🔌 Desktop MCP WebSocket closed: ${code} ${reason.toString()}`);
            this.connectionState = MCPConnectionState.DISCONNECTED;
            this.initialized = false;
            this.ws = null;

            // Auto-reconnect if not intentional
            if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.scheduleReconnect();
            }
          });

          // Connection timeout
          setTimeout(() => {
            if (this.ws?.readyState !== WebSocket.OPEN) {
              this.ws?.close();
              reject(new MCPConnectionError('Connection timeout', true));
            }
          }, 10000);

        } catch (error) {
          reject(new MCPConnectionError(`Failed to create WebSocket: ${error}`, true));
        }
      });
    } catch (error) {
      this.connectionState = MCPConnectionState.ERROR;
      throw error;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts++;
    this.connectionState = MCPConnectionState.RECONNECTING;
    
    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    console.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
      }
    }, delay);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle JSON-RPC response
      if (message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.id);

          if (message.error) {
            pending.reject(new MCPToolError(message.error.message || 'MCP error', message.error.code));
          } else {
            pending.resolve(message.result);
          }
        }
      }

      // Handle notifications (no ID)
      if (message.method && !message.id) {
        this.handleNotification(message);
      }
    } catch (error) {
      console.error('❌ Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Handle MCP notifications
   */
  private handleNotification(message: any): void {
    console.log('🔔 Desktop MCP notification:', message.method);
    // Handle notifications as needed
  }

  /**
   * Send JSON-RPC request
   */
  private async sendRequest(method: string, params: any = {}): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new MCPConnectionError('WebSocket not connected', true);
    }

    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new MCPConnectionError(`Request timeout: ${method}`, false));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        this.ws!.send(JSON.stringify(request));
      } catch (error) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(new MCPConnectionError(`Failed to send request: ${error}`, true));
      }
    });
  }

  /**
   * Initialize MCP protocol handshake
   */
  async initialize(params?: MCPInitializeParams): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const initParams = params || {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: { subscribe: true }
      },
      clientInfo: {
        name: 'designqa-desktop',
        version: '1.0.0'
      }
    };

    try {
      const result = await this.sendRequest('initialize', initParams);
      
      // Send initialized notification
      await this.sendNotification('notifications/initialized', {});
      
      this.initialized = true;
      console.log('✅ Desktop MCP initialized');
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Send notification (no response expected)
   */
  private async sendNotification(method: string, params: any = {}): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    try {
      this.ws.send(JSON.stringify(notification));
    } catch (error) {
      console.warn(`⚠️ Failed to send notification ${method}:`, error);
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<{ tools: MCPTool[] }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await this.sendRequest('tools/list', {});
    return result;
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName: string, args: Record<string, any> = {}): Promise<MCPToolResult> {
    if (!this.initialized) {
      await this.initialize();
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
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new MCPConnectionError('Client disconnected', false));
    }
    this.pendingRequests.clear();

    this.connectionState = MCPConnectionState.DISCONNECTED;
    this.initialized = false;
    console.log('🔌 Desktop MCP disconnected');
  }

  /**
   * Get Figma frame data (convenience method)
   */
  async getFrame(fileKey: string, nodeId?: string): Promise<any> {
    return this.callTool('get_metadata', { fileKey, nodeId });
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

  /**
   * Simple smoke test to verify MCP port is accessible
   * @param port - Port to test (default: 3845)
   * @returns Promise<boolean> True if port is accessible
   */
  static async smokeTest(port: number = 3845): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const wsUrl = `ws://127.0.0.1:${port}`;
        console.log(`[MCP Smoke Test] Testing connection to ${wsUrl}...`);
        
        const testWs = new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
          testWs.close();
          console.log(`[MCP Smoke Test] ❌ Timeout - port ${port} not accessible`);
          resolve(false);
        }, 2000);

        testWs.on('open', () => {
          clearTimeout(timeout);
          console.log(`[MCP Smoke Test] ✅ Port ${port} is accessible`);
          testWs.close();
          resolve(true);
        });

        testWs.on('error', (error) => {
          clearTimeout(timeout);
          console.log(`[MCP Smoke Test] ❌ Port ${port} error:`, error.message);
          resolve(false);
        });
      } catch (error) {
        console.log(`[MCP Smoke Test] ❌ Failed:`, error);
        resolve(false);
      }
    });
  }
}
