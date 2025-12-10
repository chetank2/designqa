/**
 * Unified MCP Client Interface
 * Standard interface for all MCP client implementations (Desktop, Remote, Proxy)
 */

export enum MCPConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  RECONNECTING = 'reconnecting'
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolResult {
  content?: Array<{
    type: string;
    text?: string;
    data?: any;
  }>;
  isError?: boolean;
  error?: string;
}

export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities?: {
    tools?: Record<string, any>;
    resources?: {
      subscribe?: boolean;
    };
  };
  clientInfo?: {
    name: string;
    version: string;
  };
}

export interface MCPClientConfig {
  userId?: string;
  figmaToken?: string;
  tokenProvider?: () => Promise<string | null>;
  [key: string]: any;
}

/**
 * Unified MCP Client Interface
 * All MCP client implementations must implement this interface
 */
export interface IMCPClient {
  /**
   * Connection state
   */
  readonly initialized: boolean;
  readonly connectionState: MCPConnectionState;

  /**
   * Connect to MCP server
   * @returns Promise<boolean> - true if connection successful
   */
  connect(): Promise<boolean>;

  /**
   * Disconnect from MCP server
   */
  disconnect(): Promise<void>;

  /**
   * Initialize MCP protocol handshake
   * @param params - Initialization parameters
   */
  initialize(params?: MCPInitializeParams): Promise<void>;

  /**
   * List available MCP tools
   * @returns Promise with tools list
   */
  listTools(): Promise<{ tools: MCPTool[] }>;

  /**
   * Call an MCP tool
   * @param toolName - Name of the tool to call
   * @param args - Tool arguments
   * @returns Promise with tool result
   */
  callTool(toolName: string, args?: Record<string, any>): Promise<MCPToolResult>;

  /**
   * Get Figma frame data (convenience method)
   * @param fileKey - Figma file key
   * @param nodeId - Optional node ID
   */
  getFrame?(fileKey: string, nodeId?: string): Promise<any>;

  /**
   * Get Figma styles (convenience method)
   * @param fileKey - Figma file key
   */
  getStyles?(fileKey: string): Promise<any>;

  /**
   * Get Figma tokens/variables (convenience method)
   * @param fileKey - Figma file key
   * @param nodeId - Optional node ID
   */
  getTokens?(fileKey: string, nodeId?: string): Promise<any>;
}

/**
 * Base error class for MCP client errors
 */
export class MCPClientError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'MCPClientError';
  }
}

/**
 * Connection error
 */
export class MCPConnectionError extends MCPClientError {
  constructor(message: string, public retryable: boolean = false) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'MCPConnectionError';
  }
}

/**
 * Authentication error
 */
export class MCPAuthenticationError extends MCPClientError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'MCPAuthenticationError';
  }
}

/**
 * Tool execution error
 */
export class MCPToolError extends MCPClientError {
  constructor(message: string, public toolName?: string) {
    super(message, 'TOOL_ERROR');
    this.name = 'MCPToolError';
  }
}
