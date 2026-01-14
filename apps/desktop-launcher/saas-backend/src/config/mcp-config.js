/**
 * MCP Configuration
 * Detects MCP connection mode and provides appropriate client instance
 * Priority: Desktop > Remote
 */

import FigmaMCPClient from '../figma/mcpClient.js';
import { RemoteMCPClient } from '../figma/RemoteMCPClient.js';
import { getSupabaseClient } from './supabase.js';
import { getServices } from '../database/init.js';
import { circuitBreakerRegistry } from '../core/resilience/CircuitBreaker.js';
import { logger } from '../utils/logger.js';

const PROVIDERS = {
  API: 'api',
  DESKTOP: 'desktop',
  OAUTH: 'oauth',
  FIGMA: 'figma' // legacy alias for OAuth remote MCP
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
  if (['oauth', 'remote-mcp', 'remote_oauth'].includes(normalized)) {
    return PROVIDERS.OAUTH;
  }
  if (['figma', 'figma-cloud', 'cloud', 'remote'].includes(normalized)) {
    // Treat legacy "figma/cloud/remote" as OAuth-backed remote MCP.
    return PROVIDERS.OAUTH;
  }
  return null;
}

/**
 * Verify MCP server is reachable at the given port with circuit breaker
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} True if server is reachable
 */
async function verifyMCPServerReachable(port) {
  const circuitBreaker = circuitBreakerRegistry.getOrCreate(`mcp-verify-${port}`, {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 3000,
    resetTimeout: 10000
  });

  const fallback = () => {
    logger.warn(`MCP server verification failed for port ${port}, using fallback`);
    return false;
  };

  return circuitBreaker.execute(async () => {
    const url = `http://127.0.0.1:${port}/mcp`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status >= 200 && response.status < 500) {
      return true;
    } else {
      throw new Error(`MCP server returned status ${response.status}`);
    }
  }, fallback);
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
    // If port is explicitly configured (or we want the default), verify it's reachable.
    // Discovery often relies on platform tools (ps/lsof) that can be restricted in packaged apps.
    const configuredPortRaw = process.env.FIGMA_MCP_PORT || '3845';
    const configuredPort = parseInt(configuredPortRaw, 10);
    if (Number.isFinite(configuredPort) && configuredPort > 0) {
      // Verify the port is actually reachable before marking as available
      // Removed: console.log(`[MCP] Verifying Desktop MCP at port ${configuredPort}...`);
      const isReachable = await verifyMCPServerReachable(configuredPort);
      
      if (isReachable) {
        desktopMCPAvailable = true;
        desktopMCPPort = configuredPort;
        // Removed: console.log(`[MCP] Desktop MCP verified at port ${configuredPort}`);
        setTimeout(() => {
          desktopMCPAvailable = null;
          desktopMCPPort = null;
        }, 30000);
        return { available: true, port: configuredPort };
      } else {
        console.warn(`[MCP] Desktop MCP not reachable at port ${configuredPort}`);
        desktopMCPAvailable = false;
        desktopMCPPort = configuredPort;
        setTimeout(() => {
          desktopMCPAvailable = null;
          desktopMCPPort = null;
        }, 30000);
        return { available: false, port: configuredPort };
      }
    }

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
      // Verify discovered port is reachable
      // Removed: console.log(`[MCP] Verifying discovered Desktop MCP at port ${discovery.port}...`);
      const isReachable = await verifyMCPServerReachable(discovery.port);
      
      if (isReachable) {
        desktopMCPAvailable = true;
        desktopMCPPort = discovery.port;
        // Removed: console.log(`[MCP] Desktop MCP verified at discovered port ${discovery.port}`);
        
        // Clear cache after 30 seconds
        setTimeout(() => {
          desktopMCPAvailable = null;
          desktopMCPPort = null;
        }, 30000);
        
        return { available: true, port: discovery.port };
      } else {
        console.warn(`[MCP] Discovered port ${discovery.port} not reachable`);
      }
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

  // Default provider depends on where we're running:
  // - Local desktop app: Desktop MCP
  // - Cloud deployments: OAuth-backed remote MCP
  return isLocalMode() ? PROVIDERS.DESKTOP : PROVIDERS.OAUTH;
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

async function getOAuthAccessToken(userId) {
  if (!userId) return null;
  try {
    const services = getServices();
    if (services && services.figmaAuth) {
      return await services.figmaAuth.getValidAccessToken(userId);
    }
  } catch (error) {
    // Ignore and return null
  }
  return null;
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
 * Connect Desktop MCP with circuit breaker protection
 * @param {DesktopMCPClient} client - Desktop MCP client instance
 * @param {number} maxAttempts - Maximum retry attempts
 * @returns {Promise<boolean>} True if connected successfully
 */
async function connectDesktopMCPWithRetry(client, maxAttempts = 3) {
  const circuitBreaker = circuitBreakerRegistry.getOrCreate('desktop-mcp-connect', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 5000, // 5 second timeout per connection attempt
    resetTimeout: 30000 // 30 second reset timeout
  });

  const fallback = () => {
    logger.warn('Desktop MCP connection failed, all attempts exhausted');
    return false;
  };

  return circuitBreaker.execute(async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`Desktop MCP connection attempt ${attempt}/${maxAttempts}`);

        // Add timeout per connection attempt
        const connectionPromise = client.connect();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), 3000);
        });

        const connected = await Promise.race([connectionPromise, timeoutPromise]);

        if (connected) {
          logger.info(`Desktop MCP connected successfully on attempt ${attempt}`);
          return true;
        } else {
          const error = new Error(`Desktop MCP connection attempt ${attempt} returned false`);
          if (attempt === maxAttempts) throw error;
          logger.warn(error.message);
        }
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        logger.error(`Desktop MCP connection attempt ${attempt} failed: ${error.message}`);

        if (isLastAttempt) {
          throw new Error(`Desktop MCP connection failed after ${maxAttempts} attempts: ${error.message}`);
        }

        // Exponential backoff: 500ms, 1000ms, 2000ms, etc.
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 5000);
        logger.info(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error(`Desktop MCP connection failed after ${maxAttempts} attempts`);
  }, fallback);
}

/**
 * Check if backend is running in local mode (Electron) vs cloud mode (Render/Vercel)
 * @returns {boolean} True if running in local mode
 */
function isLocalMode() {
  // Check for explicit mode setting
  const explicitMode = normalizeProvider(process.env.FIGMA_CONNECTION_MODE);
  if (explicitMode === PROVIDERS.DESKTOP) return true;
  if (explicitMode === PROVIDERS.FIGMA) return false;

  // Check for Electron environment
  if (process.env.RUNNING_IN_ELECTRON === 'true') return true;
  
  // Check for cloud hosting indicators
  if (process.env.RENDER || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT) {
    return false;
  }

  // Default: assume local mode if not explicitly cloud
  // This is safe because Desktop MCP will fail gracefully if Figma isn't running
  return true;
}

/**
 * Get MCP client instance
 * @param {Object} options - Configuration options
 * @param {string} [options.userId] - User ID for token retrieval
 * @param {string} [options.figmaToken] - Figma token (overrides auto-detection)
 * @param {string} [options.mode] - Force MCP mode ('desktop', 'proxy', 'remote', 'api')
 * @param {boolean} [options.autoDetectDesktop] - Auto-detect desktop MCP (default: true in local mode, false in cloud)
 * @returns {Promise<FigmaMCPClient|RemoteMCPClient|ProxyMCPClient|DesktopMCPClient>} MCP client instance
 */
export async function getMCPClient(options = {}) {
  const { userId, figmaToken, mode } = options;
  const overrideProvider = normalizeProvider(mode);
  let currentMode = overrideProvider;

  // Removed: console.log(`🔍 [DEBUG] getMCPClient() called with options:`, { userId: !!userId, figmaToken: !!figmaToken, mode, overrideProvider });

  // Determine if we're in local mode
  const runningInLocalMode = isLocalMode();
  
  // Auto-detect desktop MCP only in local mode and if not explicitly disabled
  const autoDetectDesktop = options.autoDetectDesktop !== undefined 
    ? options.autoDetectDesktop 
    : runningInLocalMode; // Default: true in local mode, false in cloud

  // Auto-detect desktop MCP if no mode specified and auto-detect is enabled
  if (!currentMode && autoDetectDesktop && runningInLocalMode) {
    // Removed: console.log('[MCP] Auto-detecting Desktop MCP (local mode)...');
    const desktopCheck = await checkDesktopMCPAvailability();
    if (desktopCheck.available) {
      currentMode = PROVIDERS.DESKTOP;
      // Removed: console.log(`🖥️  Desktop MCP detected on port ${desktopCheck.port}`);
    }
  } else if (!currentMode && !runningInLocalMode) {
    // In cloud mode, don't try Desktop MCP
    // Removed: console.log('[MCP] Running in cloud mode - skipping Desktop MCP auto-detection');
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
      // Figma Desktop MCP speaks HTTP/SSE on /mcp (not a raw WebSocket JSON-RPC endpoint).
      // Use the HTTP-based MCP client (RemoteMCPClient) without requiring any token.
      const desktopCheck = await checkDesktopMCPAvailability();
      if (!desktopCheck.available || !desktopCheck.port) {
        throw new Error('Desktop MCP not available. Set FIGMA_MCP_PORT=3845 or FIGMA_DESKTOP_MCP_URL.');
      }

      const desktopUrl = process.env.FIGMA_DESKTOP_MCP_URL || `http://127.0.0.1:${desktopCheck.port}/mcp`;
      // Removed: console.log(`🖥️  Initializing Desktop MCP HTTP client at ${desktopUrl}`);

      mcpClientInstance = new RemoteMCPClient({
        remoteUrl: desktopUrl,
        requireToken: false
      });

      await mcpClientInstance.connect();

      mcpMode = PROVIDERS.DESKTOP;
      return mcpClientInstance;
    } catch (error) {
      console.error('❌ Desktop MCP initialization failed:', error.message);
      // In desktop mode, return null instead of falling back to Remote
      // This prevents the tokenProvider error
      mcpClientInstance = null;
      mcpMode = PROVIDERS.DESKTOP;
      return null;
    }
  }

  if (currentMode === PROVIDERS.OAUTH || currentMode === PROVIDERS.FIGMA) {
    // OAuth-backed Remote MCP client.
    // In this product, remote MCP is only enabled when the user has completed OAuth.
    let token = figmaToken || null;
    let tokenSource = figmaToken ? 'provided_argument' : null;

    let tokenProvider = null;
    if (userId) {
      tokenProvider = createOAuthTokenProvider(userId);
    }

    // Validate OAuth connectivity up-front so we don't return a client that will fail with a
    // generic "token required" error.
    if (!token) {
      const oauthToken = await getOAuthAccessToken(userId);
      if (oauthToken) {
        token = oauthToken;
        tokenSource = 'oauth';
      }
    }

    if (!token && !tokenProvider) {
      throw new Error('Figma connection failed: OAuth not configured (missing userId).');
    }
    if (!token) {
      // tokenProvider exists but no token currently available.
      throw new Error('Figma connection failed: OAuth not connected. Complete Figma OAuth in Settings, or switch to API mode.');
    }

    // Removed: console.log(`🔌 Initializing Remote MCP Client with source: ${tokenSource || 'oauth'}`);
    // Removed: console.log(`🔑 Token (last 4): ...${token.slice(-4)}`);

    mcpClientInstance = new RemoteMCPClient({
      remoteUrl: process.env.FIGMA_MCP_URL || 'https://mcp.figma.com/mcp',
      figmaToken: token,
      // Keep provider for refresh/retry on 401 when available.
      tokenProvider,
      userId
    });

    mcpMode = PROVIDERS.OAUTH;
    return mcpClientInstance;
  }

  throw new Error(`Unsupported MCP provider: ${currentMode}. Supported providers: api, desktop, oauth`);

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
