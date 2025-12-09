/**
 * Clean Configuration
 * Simple configuration for the application
 */

import { PORTS } from './config/PORTS.js';

export const config = {
  // Server configuration
  server: {
    port: process.env.PORT || PORTS.SERVER,
    host: process.env.HOST || '0.0.0.0'  // Cloud deployments bind to all interfaces
  },

  // MCP configuration (Remote MCP for cloud deployments)
  mcp: {
    enabled: true,
    url: process.env.MCP_URL || 'https://mcp.figma.com/mcp',
    endpoint: '/mcp'
  },

  // CORS configuration
  cors: {
    origin: [
      'http://localhost:3000',
      `http://localhost:${PORTS.SERVER}`,
      `http://localhost:${PORTS.WEB_DEV}`,
      `http://localhost:${PORTS.PREVIEW}`
    ],
    credentials: true
  },

  // Timeouts
  timeouts: {
    figmaExtraction: 60000,
    webExtraction: 30000,
    comparison: 10000
  }
}; 