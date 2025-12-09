/**
 * Cross-Platform Configuration Manager
 * Handles differences between Web App and macOS App
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { CONFIGURED_PORTS } from './PORTS.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PlatformConfig {
  constructor() {
    this.platform = this.detectPlatform();
    this.config = this.loadPlatformConfig();
  }

  /**
   * Detect current platform (web only for cloud deployments)
   */
  detectPlatform() {
    // Cloud deployments always use web platform
    return 'web';
  }

  /**
   * Load platform-specific configuration
   */
  loadPlatformConfig() {
    const serverPort = CONFIGURED_PORTS.SERVER;

    const baseConfig = {
      // Shared configuration
      figma: {
        useMCP: true, // Default to MCP for both platforms
        fallbackToAPI: true
      },
      web: {
        timeout: 30000,
        headless: true
      },
      comparison: {
        chunkSize: 10,
        maxComponents: 1000
      }
    };

    const platformSpecific = {
      web: {
        server: {
          port: serverPort,
          staticPath: path.join(__dirname, '../../frontend/dist'),
          cors: {
            origin: [
              'http://localhost:3000',
              `http://localhost:${serverPort}`
            ],
            credentials: true
          }
        },
        figma: {
          useMCP: true,
          mcpServerUrl: 'https://mcp.figma.com/mcp'
        }
      },
      
    };

    return {
      ...baseConfig,
      ...platformSpecific[this.platform],
      platform: this.platform
    };
  }

  /**
   * Get server configuration for current platform
   */
  getServerConfig() {
    return this.config.server;
  }

  /**
   * Get Figma configuration for current platform
   */
  getFigmaConfig() {
    return this.config.figma;
  }

  /**
   * Get web extraction configuration
   */
  getWebConfig() {
    return this.config.web;
  }

  /**
   * Check if running on specific platform
   */
  isWeb() {
    return this.platform === 'web';
  }

  isMacOS() {
    return false; // macOS platform not supported in cloud deployments
  }

  isElectron() {
    return false; // Electron platform not supported in cloud deployments
  }

  /**
   * Get platform-specific middleware configuration
   */
  getMiddlewareConfig() {
    const base = {
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
      },
      helmet: {
        contentSecurityPolicy: false, // Disable for development
        crossOriginEmbedderPolicy: false
      }
    };


    return base;
  }

  /**
   * Get logging configuration for platform
   */
  getLoggingConfig() {
    return {
      level: 'info',
      console: true,
      file: true, // File logging for cloud deployments
      format: 'json'
    };
  }
}

// Export singleton instance
export const platformConfig = new PlatformConfig();
export default platformConfig;
