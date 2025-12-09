/**
 * MCP Configuration
 * Detects MCP connection mode and provides appropriate client instance
 */

import FigmaMCPClient from '../figma/mcpClient.js';
import { RemoteMCPClient } from '../figma/RemoteMCPClient.js';
import { getSupabaseClient } from './supabase.js';

const PROVIDERS = {
  API: 'api',
  FIGMA: 'figma'
};

let mcpClientInstance = null;
let mcpMode = null;

function normalizeProvider(value) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (['api', 'figma-api'].includes(normalized)) {
    return PROVIDERS.API;
  }
  if (['figma', 'figma-cloud', 'cloud', 'remote'].includes(normalized)) {
    return PROVIDERS.FIGMA;
  }
  return null;
}

export function getMCPProvider() {
  const envPreference =
    normalizeProvider(process.env.FIGMA_CONNECTION_MODE) ||
    normalizeProvider(process.env.MCP_PROVIDER) ||
    normalizeProvider(process.env.MCP_MODE) ||
    normalizeProvider(process.env.VITE_MCP_MODE);

  if (envPreference) {
    return envPreference;
  }

  // Default to Remote MCP for cloud deployments
  return PROVIDERS.FIGMA;
}

/**
 * Detect MCP connection mode (legacy helper)
 */
export function detectMCPMode() {
  return getMCPProvider();
}

/**
 * Get Figma token from Supabase Vault or environment
 * @param {string} userId - User ID (optional)
 * @returns {Promise<string|null>} Figma token or null
 */
async function getFigmaToken(userId = null) {
  // First try environment variable (supporting specific service token first)
  const envToken = process.env.FIGMA_MCP_SERVICE_TOKEN || process.env.FIGMA_API_KEY || process.env.FIGMA_TOKEN;
  if (envToken) {
    return envToken;
  }

  // Try to get from Supabase Vault if user ID provided
  if (userId) {
    try {
      const supabase = getSupabaseClient(false);
      if (supabase) {
        // Try to get from user settings or vault
        // This would require a user_settings table or similar
        // For now, return null and let the caller handle it
      }
    } catch (error) {
      console.warn('Failed to get Figma token from Supabase:', error.message);
    }
  }

  return null;
}

/**
 * Get MCP client instance
 * @param {Object} options - Configuration options
 * @param {string} [options.userId] - User ID for token retrieval
 * @param {string} [options.figmaToken] - Figma token (overrides auto-detection)
 * @param {string} [options.mode] - Force MCP mode ('local' or 'remote')
 * @returns {Promise<FigmaMCPClient|RemoteMCPClient>} MCP client instance
 */
export async function getMCPClient(options = {}) {
  const { userId, figmaToken, mode } = options;
  const overrideProvider = normalizeProvider(mode);
  const currentMode = overrideProvider || getMCPProvider();

  if (currentMode === PROVIDERS.API) {
    mcpClientInstance = null;
    mcpMode = PROVIDERS.API;
    return null;
  }

  if (mcpClientInstance && mcpMode === currentMode) {
    return mcpClientInstance;
  }

  if (currentMode === PROVIDERS.FIGMA) {
    // For Remote MCP, prioritize the Service Token (System Account)
    // If not set, fallback to user's Key (Personal Account)
    let token = process.env.FIGMA_MCP_SERVICE_TOKEN;
    if (!token) {
      token = figmaToken || await getFigmaToken(userId);
    }

    if (!token) {
      throw new Error('Figma connection failed: No Service Token (FIGMA_MCP_SERVICE_TOKEN) or User API Key found.');
    }

    mcpClientInstance = new RemoteMCPClient({
      remoteUrl: process.env.FIGMA_MCP_URL || 'https://mcp.figma.com/mcp',
      figmaToken: token
    });
  } else {
    throw new Error(`Unsupported MCP provider: ${currentMode}. Supported providers: api, figma`);
  }

  mcpMode = currentMode;
  return mcpClientInstance;
}

/**
 * Get current MCP mode
 * @returns {'local'|'remote'} Current MCP mode
 */
export function getMCPMode() {
  if (!mcpMode) {
    mcpMode = detectMCPMode();
  }
  return mcpMode;
}

/**
 * Reset MCP client instance (useful for testing or mode changes)
 */
export function resetMCPClient() {
  mcpClientInstance = null;
  mcpMode = null;
}

export default {
  detectMCPMode,
  getMCPClient,
  getMCPMode,
  getMCPProvider,
  resetMCPClient
};
