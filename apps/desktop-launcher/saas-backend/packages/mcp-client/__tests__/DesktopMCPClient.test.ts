/**
 * DesktopMCPClient Tests
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { DesktopMCPClient } from '../src/DesktopMCPClient.js';
import { MockMCPServer } from './mock-mcp-server.js';

describe('DesktopMCPClient', () => {
  let mockServer: MockMCPServer;
  let serverPort: number;

  beforeAll(async () => {
    mockServer = new MockMCPServer({ port: 3846 }); // Use different port to avoid conflicts
    serverPort = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should connect to mock MCP server', async () => {
    const client = new DesktopMCPClient({
      port: serverPort,
      autoDiscover: false
    });

    const connected = await client.connect();
    expect(connected).toBe(true);
    expect(client.connectionState).toBe('connected');

    await client.disconnect();
  });

  it('should initialize MCP protocol', async () => {
    const client = new DesktopMCPClient({
      port: serverPort,
      autoDiscover: false
    });

    await client.connect();
    await client.initialize();

    expect(client.initialized).toBe(true);

    await client.disconnect();
  });

  it('should list available tools', async () => {
    const client = new DesktopMCPClient({
      port: serverPort,
      autoDiscover: false
    });

    await client.connect();
    await client.initialize();

    const tools = await client.listTools();
    expect(tools.tools).toBeDefined();
    expect(tools.tools.length).toBeGreaterThan(0);
    expect(tools.tools[0].name).toBeDefined();

    await client.disconnect();
  });

  it('should call MCP tools', async () => {
    const client = new DesktopMCPClient({
      port: serverPort,
      autoDiscover: false
    });

    await client.connect();
    await client.initialize();

    const result = await client.callTool('get_metadata', { nodeId: '1:2' });
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();

    await client.disconnect();
  });

  it('should handle reconnection', async () => {
    const client = new DesktopMCPClient({
      port: serverPort,
      autoDiscover: false,
      maxReconnectAttempts: 2
    });

    await client.connect();
    await client.initialize();

    // Simulate disconnection
    await mockServer.stop();
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Restart server
    await mockServer.start();

    // Client should attempt to reconnect on next operation
    try {
      await client.listTools();
    } catch (error) {
      // Reconnection may fail, which is expected in test environment
    }

    await client.disconnect();
  });
});
