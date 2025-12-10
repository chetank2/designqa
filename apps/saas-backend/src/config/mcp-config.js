/**
 * MCP Configuration
 * Detects MCP connection mode and provides appropriate client instance
 * Priority: Desktop > Proxy > Remote
 */

import FigmaMCPClient from '../figma/mcpClient.js';
import { RemoteMCPClient } from '../figma/RemoteMCPClient.js';
import { ProxyMCPClient } from '../figma/ProxyMCPClient.js';
import { getSupabaseClient } from './supabase.js';
import { getServices } from '../database/init.js';

const PROVIDERS = {
  API: 'api',
  DESKTOP: 'desktop',
  PROXY: 'proxy',
  FIGMA: 'figma'
};

let desktopMCPAvailable = null;
let desktopMCPPort = null;

let mcpClientInstance = null;
let mcpMode = null;

function normalizeProvider(value) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (['api', 'figma-api'].includes(normalized)) {
    return PROVIDERS.API;
  }
  if (['desktop', 'local', 'figma-desktop'].includes(normalized)) {
    return PROVIDERS.DESKTOP;
  }
  if (['proxy', 'mcp-proxy'].includes(normalized)) {
    return PROVIDERS.PROXY;
  }
  if (['figma', 'figma-cloud', 'cloud', 'remote'].includes(normalized)) {
    return PROVIDERS.FIGMA;
  }
  return null;
}

/**
 * Check if Desktop MCP is available
 * @returns {Promise<{available: boolean, port: number|null}>}
 */
async function checkDesktopMCPAvailability() {
  // Cache result for 30 seconds
  if (desktopMCPAvailable !== null) {
    return { available: desktopMCPAvailable, port: desktopMCPPort };
  }

  try {
    // Try to import DesktopMCPClient and discovery
    const { DesktopMCPClient } = await import('@designqa/mcp-client');
    const { discoverMCPPort, isFigmaRunning } = await import('@designqa/mcp-client/discovery');

    // Check if Figma is running
    const figmaRunning = await isFigmaRunning();
    if (!figmaRunning) {
      desktopMCPAvailable = false;
      desktopMCPPort = null;
      return { available: false, port: null };
    }

    // Try to discover port
    const discovery = await discoverMCPPort();
    if (discovery.port) {
      desktopMCPAvailable = true;
      desktopMCPPort = discovery.port;
      
      // Clear cache after 30 seconds
      setTimeout(() => {
        desktopMCPAvailable = null;
        desktopMCPPort = null;
      }, 30000);
      
      return { available: true, port: discovery.port };
    }

    desktopMCPAvailable = false;
    desktopMCPPort = null;
    return { available: false, port: null };
  } catch (error) {
    console.warn('⚠️ Desktop MCP check failed:', error.message);
    desktopMCPAvailable = false;
    desktopMCPPort = null;
    return { available: false, port: null };
  }
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
 * Get Figma OAuth token provider function
 * @param {string} userId - User ID
 * @returns {Function} Async function that returns token or null
 */
function createOAuthTokenProvider(userId) {
  return async () => {
    try {
      const services = getServices();
      if (services && services.figmaAuth) {
        const token = await services.figmaAuth.getValidAccessToken(userId);
        if (token) {
          return token;
        }
      }
    } catch (error) {
      // Services not initialized or OAuth token not available
      // Fall through to PAT fallback
    }
    return null;
  };
}

/**
 * Get Figma token from OAuth, Supabase Vault, or environment
 * Priority: OAuth token > Environment variable > PAT from database
 * @param {string} userId - User ID (optional)
 * @returns {Promise<string|null>} Figma token or null
 */
async function getFigmaToken(userId = null) {
  // First try OAuth token if user ID provided
  if (userId) {
    try {
      const services = getServices();
      if (services && services.figmaAuth) {
        const oauthToken = await services.figmaAuth.getValidAccessToken(userId);
        if (oauthToken) {
          return oauthToken;
        }
      }
    } catch (error) {
      // Services not initialized or OAuth token not available
      // Fall through to other methods
    }
  }

  // Try environment variable (supporting specific service token first)
  const envToken = process.env.FIGMA_MCP_SERVICE_TOKEN || process.env.FIGMA_API_KEY || process.env.FIGMA_TOKEN;
  if (envToken) {
    return envToken;
  }

  // Try to get PAT from Supabase if user ID provided
  if (userId) {
    try {
      const supabase = getSupabaseClient(true); // Use service role for database access
      if (supabase) {
        const { data } = await supabase
          .from('figma_api_keys')
          .select('api_key')
          .eq('user_id', userId)
          .single();

        if (data && data.api_key) {
          const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY ||
            process.env.LOCAL_CREDENTIAL_KEY ||
            'local-credential-encryption-key-change-in-production';
          const { decrypt } = await import('../services/CredentialEncryption.js');
          return decrypt(data.api_key, encryptionKey);
        }
      }
    } catch (error) {
      console.warn('Failed to get Figma PAT from Supabase:', error.message);
    }
  }

  return null;
}

/**
 * Get MCP client instance
 * @param {Object} options - Configuration options
 * @param {string} [options.userId] - User ID for token retrieval
 * @param {string} [options.figmaToken] - Figma token (overrides auto-detection)
 * @param {string} [options.mode] - Force MCP mode ('desktop', 'proxy', 'remote', 'api')
 * @param {boolean} [options.autoDetectDesktop] - Auto-detect desktop MCP (default: true)
 * @returns {Promise<FigmaMCPClient|RemoteMCPClient|ProxyMCPClient|DesktopMCPClient>} MCP client instance
 */
export async function getMCPClient(options = {}) {
  const { userId, figmaToken, mode, autoDetectDesktop = true } = options;
  const overrideProvider = normalizeProvider(mode);
  let currentMode = overrideProvider;

  // Auto-detect desktop MCP if no mode specified and auto-detect is enabled
  if (!currentMode && autoDetectDesktop) {
    const desktopCheck = await checkDesktopMCPAvailability();
    if (desktopCheck.available) {
      currentMode = PROVIDERS.DESKTOP;
      console.log(`🖥️  Desktop MCP detected on port ${desktopCheck.port}`);
    }
  }

  // Fall back to configured provider if no desktop found
  if (!currentMode) {
    currentMode = getMCPProvider();
  }

  if (currentMode === PROVIDERS.API) {
    mcpClientInstance = null;
    mcpMode = PROVIDERS.API;
    return null;
  }

  if (mcpClientInstance && mcpMode === currentMode) {
    return mcpClientInstance;
  }

  // Priority: Desktop > Proxy > Remote
  if (currentMode === PROVIDERS.DESKTOP) {
    try {
      const { DesktopMCPClient } = await import('@designqa/mcp-client');
      
      const desktopCheck = await checkDesktopMCPAvailability();
      if (!desktopCheck.available) {
        throw new Error('Desktop MCP not available. Figma Desktop app may not be running.');
      }

      console.log(`🖥️  Initializing Desktop MCP Client on port ${desktopCheck.port}`);
      
      mcpClientInstance = new DesktopMCPClient({
        port: desktopCheck.port,
        autoDiscover: true
      });

      mcpMode = PROVIDERS.DESKTOP;
      return mcpClientInstance;
    } catch (error) {
      console.warn('⚠️ Desktop MCP initialization failed, falling back to Proxy/Remote:', error.message);
      // Fall through to Proxy/Remote
      currentMode = process.env.MCP_USE_PROXY === 'true' || !!process.env.MCP_PROXY_URL 
        ? PROVIDERS.PROXY 
        : PROVIDERS.FIGMA;
    }
  }

  if (currentMode === PROVIDERS.PROXY || (currentMode === PROVIDERS.FIGMA && (process.env.MCP_USE_PROXY === 'true' || !!process.env.MCP_PROXY_URL))) {
    // Check if we should use the proxy
    const useProxy = process.env.MCP_USE_PROXY === 'true' || !!process.env.MCP_PROXY_URL;
    
    // Create token provider if userId is available (for OAuth token refresh)
    let tokenProvider = null;
    if (userId) {
      tokenProvider = createOAuthTokenProvider(userId);
    }

    if (useProxy) {
      // Use proxy MCP client
      let token = process.env.FIGMA_MCP_SERVICE_TOKEN;
      let tokenSource = 'service_token (FIGMA_MCP_SERVICE_TOKEN)';

      if (!token) {
        token = figmaToken;
        tokenSource = 'provided_argument';
      }

      if (!token) {
        token = await getFigmaToken(userId);
        tokenSource = userId ? 'oauth_or_pat' : 'environment';
      }

      if (!token && !tokenProvider) {
        throw new Error('Figma connection failed: No Service Token (FIGMA_MCP_SERVICE_TOKEN) or User API Key found.');
      }

      const proxyUrl = process.env.MCP_PROXY_URL || 'https://mcp-proxy.onrender.com';
      console.log(`🔌 Initializing Proxy MCP Client with source: ${tokenSource}`);
      console.log(`🌐 Proxy URL: ${proxyUrl}`);
      if (token) {
        console.log(`🔑 Token (last 4): ...${token.slice(-4)}`);
      } else {
        console.log(`🔑 Using OAuth token provider`);
      }

      mcpClientInstance = new ProxyMCPClient({
        proxyUrl: proxyUrl,
        figmaToken: token,
        tokenProvider: tokenProvider,
        userId: userId
      });
      
      mcpMode = PROVIDERS.PROXY;
      return mcpClientInstance;
    }
  }

  if (currentMode === PROVIDERS.FIGMA) {
    // Use direct remote MCP client
    let token = process.env.FIGMA_MCP_SERVICE_TOKEN;
    let tokenSource = 'service_token (FIGMA_MCP_SERVICE_TOKEN)';

    if (!token) {
      token = figmaToken;
      tokenSource = 'provided_argument';
    }

    if (!token) {
      token = await getFigmaToken(userId);
      tokenSource = userId ? 'oauth_or_pat' : 'environment';
    }

    if (!token && !tokenProvider) {
      throw new Error('Figma connection failed: No Service Token (FIGMA_MCP_SERVICE_TOKEN) or User API Key found.');
    }

    console.log(`🔌 Initializing Remote MCP Client with source: ${tokenSource}`);
    if (token) {
      console.log(`🔑 Token (last 4): ...${token.slice(-4)}`);
    } else {
      console.log(`🔑 Using OAuth token provider`);
    }

    mcpClientInstance = new RemoteMCPClient({
      remoteUrl: process.env.FIGMA_MCP_URL || 'https://mcp.figma.com/mcp',
      figmaToken: token,
      tokenProvider: tokenProvider,
      userId: userId
    });
    
    mcpMode = PROVIDERS.FIGMA;
    return mcpClientInstance;
  }

  throw new Error(`Unsupported MCP provider: ${currentMode}. Supported providers: api, desktop, proxy, figma`);

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
