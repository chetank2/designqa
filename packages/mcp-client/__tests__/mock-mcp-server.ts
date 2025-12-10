/**
 * Mock MCP Server for Testing
 * Simulates Figma Desktop MCP server for testing DesktopMCPClient
 */

import WebSocket from 'ws';
import { Server } from 'http';

export interface MockMCPServerOptions {
  port?: number;
  delay?: number; // Simulate network delay
}

export class MockMCPServer {
  private wss: WebSocket.Server | null = null;
  private server: Server | null = null;
  private port: number;
  private delay: number;
  private messageId = 0;

  constructor(options: MockMCPServerOptions = {}) {
    this.port = options.port || 3845;
    this.delay = options.delay || 0;
  }

  /**
   * Start the mock server
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocket.Server({ port: this.port });

        this.wss.on('connection', (ws) => {
          console.log(`[Mock MCP] Client connected`);

          ws.on('message', async (data: WebSocket.Data) => {
            const message = JSON.parse(data.toString());
            await this.handleMessage(ws, message);
          });

          ws.on('close', () => {
            console.log(`[Mock MCP] Client disconnected`);
          });

          ws.on('error', (error) => {
            console.error(`[Mock MCP] WebSocket error:`, error);
          });
        });

        this.wss.on('listening', () => {
          console.log(`[Mock MCP] Server listening on port ${this.port}`);
          resolve(this.port);
        });

        this.wss.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(ws: WebSocket, message: any): Promise<void> {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    try {
      switch (message.method) {
        case 'initialize':
          this.handleInitialize(ws, message);
          break;
        case 'tools/list':
          this.handleListTools(ws, message);
          break;
        case 'tools/call':
          this.handleCallTool(ws, message);
          break;
        case 'notifications/initialized':
          // No response needed for notifications
          break;
        default:
          this.sendError(ws, message.id, -32601, `Method not found: ${message.method}`);
      }
    } catch (error) {
      this.sendError(ws, message.id, -32603, `Internal error: ${error}`);
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(ws: WebSocket, message: any): void {
    const response = {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'mock-mcp-server',
          version: '1.0.0'
        }
      }
    };
    ws.send(JSON.stringify(response));
  }

  /**
   * Handle tools/list request
   */
  private handleListTools(ws: WebSocket, message: any): void {
    const response = {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: [
          {
            name: 'get_metadata',
            description: 'Get Figma node metadata'
          },
          {
            name: 'get_code',
            description: 'Get Figma node code'
          },
          {
            name: 'get_variable_defs',
            description: 'Get Figma variable definitions'
          }
        ]
      }
    };
    ws.send(JSON.stringify(response));
  }

  /**
   * Handle tools/call request
   */
  private handleCallTool(ws: WebSocket, message: any): void {
    const { name, arguments: args } = message.params;

    let result: any;

    switch (name) {
      case 'get_metadata':
        result = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: args.nodeId || '1:2',
              name: 'Mock Component',
              type: 'COMPONENT'
            })
          }]
        };
        break;

      case 'get_code':
        result = {
          content: [{
            type: 'text',
            text: '<div>Mock Code</div>'
          }]
        };
        break;

      case 'get_variable_defs':
        result = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              'color/primary': '#000000'
            })
          }]
        };
        break;

      default:
        return this.sendError(ws, message.id, -32601, `Tool not found: ${name}`);
    }

    const response = {
      jsonrpc: '2.0',
      id: message.id,
      result
    };
    ws.send(JSON.stringify(response));
  }

  /**
   * Send error response
   */
  private sendError(ws: WebSocket, id: number, code: number, message: string): void {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };
    ws.send(JSON.stringify(response));
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.log(`[Mock MCP] Server stopped`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return `ws://127.0.0.1:${this.port}`;
  }
}
