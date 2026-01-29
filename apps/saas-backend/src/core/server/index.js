/**
 * Clean Server Implementation
 * Single server with MCP-only Figma extraction
 */

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import cookieParser from 'cookie-parser';
import FigmaMCPClient from '../../figma/mcpClient.js';
import UnifiedWebExtractor from '../../web/UnifiedWebExtractor.js';
import ComparisonEngine from '../../compare/comparisonEngine.js';
import { ScreenshotComparisonService } from '../../compare/ScreenshotComparisonService.js';
import { loadConfig, getFigmaApiKey } from '../../config/index.js';
import { getMCPClient, getMCPProvider } from '../../config/mcp-config.js';
import { logger } from '../../utils/logger.js';
import { performanceMonitor } from '../../monitoring/performanceMonitor.js';
import {
  configureSecurityMiddleware,
  configureRateLimit,
  errorHandler,
  notFoundHandler,
  responseFormatter,
  requestLogger,
  validateExtractionUrl
} from '../../server/middleware.js';
import rateLimit from 'express-rate-limit';
import { getBrowserPool, shutdownBrowserPool } from '../../browser/BrowserPool.js';
import { getResourceManager, shutdownResourceManager } from '../../utils/ResourceManager.js';
import { getOutputBaseDir } from '../../utils/outputPaths.js';
import { initDatabase } from '../../database/init.js';
import { resolveSiteProfileForUrl, applySiteProfileOptions } from '../../utils/siteProfiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config file path
const legacyConfigPath = path.join(__dirname, '../../../config.json');
const userConfigDir = process.env.DESIGNQA_DATA_DIR ||
  path.join(process.env.HOME || os.homedir() || process.cwd(), '.designqa');
const configPath = process.env.DESKTOP_CONFIG_PATH ||
  path.join(userConfigDir, 'config.json');

// Load Figma API key from config
function loadFigmaApiKey() {
  try {
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return configData.figmaApiKey || process.env.FIGMA_API_KEY || '';
    }
    if (fs.existsSync(legacyConfigPath)) {
      const legacyData = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf8'));
      return legacyData.figmaApiKey || process.env.FIGMA_API_KEY || '';
    }
  } catch (error) {
  }
  return process.env.FIGMA_API_KEY || '';
}

// Get Figma API Key for user
async function getUserFigmaApiKey(_userId) {
  // Local-first mode always uses the locally stored key.
  return loadFigmaApiKey();
}

// Save Figma API key to config
function saveFigmaApiKey(apiKey) {
  try {
    // Ensure config directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let configData = {};
    if (fs.existsSync(configPath)) {
      configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    configData.figmaApiKey = apiKey;
    configData.lastUpdated = new Date().toISOString();
    if (!configData.createdAt) {
      configData.createdAt = new Date().toISOString();
    }

    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

async function resolveExtractionOptions(url, baseOptions) {
  const profile = await resolveSiteProfileForUrl(url);
  const { options, profile: activeProfile } = applySiteProfileOptions(baseOptions, profile);
  return { options, profile: activeProfile };
}

function attachSiteProfileMetadata(webData, profile) {
  if (!profile || !webData) return;
  webData.metadata = {
    ...(webData.metadata || {}),
    siteProfile: {
      id: profile.id,
      name: profile.name,
      domain: profile.domain
    }
  };
}

export async function startServer(portArg) {
  // Load configuration with fallback to defaults
  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    console.warn('Failed to load new config, using legacy config:', error.message);
    // Fallback to legacy config for now
    const legacyConfig = await import('../../config.js');
    config = legacyConfig.config;
  }

  // Ensure config has required structure
  if (!config) {
    config = {};
  }
  if (!config.server) {
    config.server = {
      host: process.env.HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '3847', 10)
    };
  }
  if (!config.server.host) {
    config.server.host = process.env.HOST || '0.0.0.0';
  }
  if (!config.server.port) {
    config.server.port = parseInt(process.env.PORT || '3847', 10);
  }
  if (!config.mcp) {
    config.mcp = {
      url: process.env.MCP_PROXY_URL || 'http://localhost:3001',
      endpoint: process.env.MCP_ENDPOINT || '/sse',
      mode: process.env.MCP_MODE || 'figma'
    };
  }
  if (!config.mcp.url) {
    config.mcp.url = process.env.MCP_PROXY_URL || 'http://localhost:3001';
  }
  if (!config.mcp.endpoint) {
    config.mcp.endpoint = process.env.MCP_ENDPOINT || '/sse';
  }
  if (!config.mcp.mode) {
    config.mcp.mode = process.env.MCP_MODE || 'figma';
  }

  const figmaConnectionMode = getMCPProvider();
  const isApiOnlyFigma = figmaConnectionMode === 'api';

  // Determine if we're running in local mode (Electron) vs cloud mode (Render/Vercel)
  const isLocalMode = process.env.RUNNING_IN_ELECTRON === 'true' ||
    (!process.env.RENDER && !process.env.VERCEL && !process.env.RAILWAY_ENVIRONMENT);

  if (isLocalMode) {
    // Removed: console.log('[MCP] Backend running in LOCAL mode - Desktop MCP available');
  } else {
    // Removed: console.log('[MCP] Backend running in CLOUD mode - Desktop MCP not available');
  }

  // Create Express app and HTTP server
  const app = express();
  const httpServer = createServer(app);

  // Enhanced service initialization with backward compatibility
  let serviceManager;
  let figmaClient, comparisonEngine, browserPool, unifiedWebExtractor, resourceManager;
  // Legacy compatibility aliases - all point to UnifiedWebExtractor
  let webExtractorV2, enhancedWebExtractor;

  try {
    // Try enhanced service initialization
    const { serviceManager: sm } = await import('../../services/core/ServiceManager.js');
    serviceManager = sm;

    // Add timeout for service initialization (10 seconds)
    const initPromise = serviceManager.initializeServices(config);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 10000));

    const initResults = await Promise.race([initPromise, timeoutPromise]);

    if (initResults.timeout) {
      console.warn('⚠️ Service initialization timed out after 10s - continuing in degraded mode');
      // We still want to try to get services if they initialized partially, but for now we assume degraded
    } else if (initResults.success) {
      console.log('✅ Enhanced service initialization successful');

      // Get services from enhanced service manager
      if (!isApiOnlyFigma) {
        try {
          // Only try Desktop MCP in local mode
          if (isLocalMode) {
            // Removed: console.log('[MCP] Attempting Desktop MCP connection (local mode)...');
            figmaClient = await getMCPClient({ mode: figmaConnectionMode, autoDetectDesktop: true });
          } else {
            // Removed: console.log('[MCP] Using Remote MCP (cloud mode)...');
            figmaClient = await getMCPClient({ mode: 'figma', autoDetectDesktop: false });
          }
        } catch (mcpError) {
          console.warn('[MCP] Failed to get MCP client:', mcpError.message);
          figmaClient = serviceManager.getService('mcpClient');
        }
      }
      comparisonEngine = serviceManager.getService('comparisonEngine');
      browserPool = serviceManager.getService('browserPool');

      // Initialize unified extractor and resource manager
      unifiedWebExtractor = new UnifiedWebExtractor();
      resourceManager = getResourceManager();

      // Legacy compatibility - all extractors point to the unified one
      enhancedWebExtractor = serviceManager.getService('webExtractor'); // This now returns UnifiedWebExtractor
      webExtractorV2 = unifiedWebExtractor; // Compatibility alias

    } else {
      throw new Error('Enhanced initialization failed, using fallback');
    }
  } catch (error) {
    console.warn('⚠️ Enhanced service initialization failed, using legacy mode:', error.message);

    // Fallback to legacy initialization (preserve existing functionality)
    try {
      if (!isApiOnlyFigma) {
        // Only try Desktop MCP in local mode
        if (isLocalMode) {
          // Removed: console.log('[MCP] Attempting Desktop MCP connection (legacy fallback, local mode)...');
          figmaClient = await getMCPClient({ mode: figmaConnectionMode, autoDetectDesktop: true });
        } else {
          // Removed: console.log('[MCP] Using Remote MCP (legacy fallback, cloud mode)...');
          figmaClient = await getMCPClient({ mode: 'figma', autoDetectDesktop: false });
        }
      }
    } catch (mcpError) {
      if (!isApiOnlyFigma) {
        console.warn('[MCP] Legacy fallback failed:', mcpError.message);
        throw mcpError;
      }
    }
    comparisonEngine = new ComparisonEngine();
    browserPool = getBrowserPool();
    unifiedWebExtractor = new UnifiedWebExtractor();
    resourceManager = getResourceManager();

    // Legacy compatibility - all extractors point to the unified one
    enhancedWebExtractor = unifiedWebExtractor; // Compatibility alias
    webExtractorV2 = unifiedWebExtractor; // Compatibility alias

    // Start performance monitoring the old way
    performanceMonitor.startMonitoring();
  }

  // WebSocket server implementation pending - will be added in future version
  // const webSocketManager = initializeWebSocket(httpServer, config);
  const webSocketManager = {
    getActiveConnectionsCount: () => 0,
    getActiveComparisonsCount: () => 0,
    createProgressTracker: (id) => ({
      update: () => { },
      complete: () => { },
      error: () => { }
    })
  };

  // Global MCP connection status
  let mcpConnected = isApiOnlyFigma ? null : false;

  // Initialize Screenshot Comparison Service
  let screenshotComparisonService;
  try {
    // Get storage provider for screenshot service
    const { getStorageProvider } = await import('../../config/storage-config.js');
    const storage = getStorageProvider(null); // Screenshots don't need userId for local mode
    screenshotComparisonService = new ScreenshotComparisonService(config, storage);
  } catch (error) {
    console.warn('⚠️ Screenshot comparison service initialization failed:', error.message);
  }

  // Initialize database and services with timeout
  let dbServices = null;
  try {
    const dbInitPromise = initDatabase({ userId: null });
    const dbTimeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Database initialization timed out')), 5000));

    dbServices = await Promise.race([dbInitPromise, dbTimeoutPromise]); // Will be set per-request if user authenticated
    console.log('✅ Database and services initialized');
  } catch (error) {
    console.warn('⚠️ Database initialization failed or timed out:', error.message);
    console.warn('   Continuing without database - some features may be limited');
  }

  // Configure enhanced middleware
  configureSecurityMiddleware(app, config);

  // HTTPS enforcement in production
  if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      // Check if request is already secure (via proxy headers)
      const isSecure = req.secure ||
        req.headers['x-forwarded-proto'] === 'https' ||
        req.headers['x-forwarded-ssl'] === 'on';

      if (!isSecure && req.method !== 'GET') {
        // Redirect POST/PUT/DELETE to HTTPS
        return res.redirect(301, `https://${req.get('host')}${req.url}`);
      }

      next();
    });
  }

  // Cookie parser middleware (required for OAuth state management)
  app.use(cookieParser());

  // Body parsing middleware - MUST come before routes
  // Increased limits to handle large payloads (but multipart/form-data uses multer)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Development cache control (prevent browser caching issues)
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      next();
    });
  }

  // Request logging
  app.use(requestLogger);

  // Authentication middleware (extracts user if present, but doesn't require it)
  try {
    const { extractUser } = await import('../../server/auth-middleware.js');
    app.use(extractUser);
    // Removed: console.log('✅ Auth middleware registered');
  } catch (error) {
    console.warn('⚠️ Failed to load auth middleware:', error.message);
  }

  // Database services middleware - attach to every request
  app.use((req, res, next) => {
    req.dbServices = dbServices;
    next();
  });

  // Response formatting
  app.use(responseFormatter);

  // Rate limiting - ONLY for Figma API calls (external API that needs protection)
  const { generalLimiter, healthLimiter, extractionLimiter } = configureRateLimit(config);

  // Apply extraction rate limiting ONLY to Figma API endpoints
  app.use('/api/figma-only/extract', extractionLimiter);
  // Note: /api/compare and /api/web/extract* should NOT be rate limited
  // They are internal operations, not external API calls

  // NO rate limiting for any other endpoints - all operations should be unlimited except Figma API

  // Note: Server control routes removed for SaaS mode (start/stop/restart not applicable)

  try {
    const extensionRoutes = await import('../../routes/extensionRoutes.js');
    // Ensure config has security structure
    if (!config.security) {
      config.security = { allowedHosts: [] };
    }
    app.use('/api/extension', extensionRoutes.createExtensionRoutes(config));
    console.log('✅ Extension routes registered');
  } catch (error) {
    console.warn('⚠️ Failed to load extension routes:', error.message);
  }

  // Auth Routes (OAuth for Figma)
  try {
    const authRoutes = await import('../../routes/auth-routes.js');
    app.use('/api/auth', healthLimiter, authRoutes.default);
    // Removed: console.log('✅ Auth routes registered');
  } catch (error) {
    console.warn('⚠️ Failed to load auth routes:', error.message);
  }

  // Desktop Routes
  try {
    const desktopRoutes = await import('../../routes/desktop.js');
    app.post('/api/desktop/register', healthLimiter, desktopRoutes.default.registerDesktop);
    app.get('/api/desktop/capabilities/:userId', healthLimiter, desktopRoutes.default.getDesktopCapabilities);
    app.get('/api/user/preferences', healthLimiter, desktopRoutes.default.getUserPreferences);
    app.put('/api/user/preferences', healthLimiter, desktopRoutes.default.saveUserPreferences);
    console.log('✅ Desktop routes registered');
  } catch (error) {
    console.warn('⚠️ Failed to load desktop routes:', error.message);
  }

  // MCP Routes
  try {
    const mcpRoutes = await import('../../routes/mcp-routes.js');
    app.use('/api/mcp', mcpRoutes.default);
    // Removed: console.log('✅ MCP routes registered');

    // MCP Test Routes
    const mcpTestRoutes = await import('../../routes/mcp-test-routes.js');
    app.use('/api/mcp', mcpTestRoutes.default);
    console.log('✅ MCP test routes registered');
  } catch (error) {
    console.warn('⚠️ Failed to load MCP routes:', error.message);
  }

  // Credentials Routes
  try {
    const credentialsRoutes = await import('../../routes/credentials.js');
    app.use('/api/credentials', healthLimiter, credentialsRoutes.default);
    // Removed: console.log('✅ Credentials routes registered');
  } catch (error) {
    console.warn('⚠️ Failed to load credentials routes:', error.message);
  }

  // Site Profiles Routes
  try {
    const siteProfilesRoutes = await import('../../routes/site-profiles.js');
    app.use('/api/site-profiles', healthLimiter, siteProfilesRoutes.default);
  } catch (error) {
    console.warn('⚠️ Failed to load site profiles routes:', error.message);
  }

  // Design Systems Routes
  try {
    const designSystemRoutes = await import('../../routes/design-systems.js');
    app.use('/api/design-systems', healthLimiter, designSystemRoutes.default);
    console.log('✅ Design System routes registered');
  } catch (error) {
    console.warn('⚠️ Failed to load design system routes:', error.message);
  }

  // Reports Routes
  try {
    const reportsRoutes = await import('../../routes/reports.js');
    app.use('/api/reports', healthLimiter, reportsRoutes.default);
    // Removed: console.log('✅ Reports routes registered');
  } catch (error) {
    console.warn('⚠️ Failed to load reports routes:', error.message);
  }

  /**
   * MCP Proxy endpoint for remote MCP calls
   * Prevents tokens from reaching the browser
   */
  app.post('/api/mcp/proxy', healthLimiter, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required for remote MCP'
        });
      }

      const { method, params } = req.body;

      if (!method) {
        return res.status(400).json({
          success: false,
          error: 'Method is required'
        });
      }

      if (isApiOnlyFigma) {
        return res.status(400).json({
          success: false,
          error: 'MCP is disabled in API-only mode.'
        });
      }

      // Get MCP client with user's token (force remote provider)
      const mcpClient = await getMCPClient({
        userId: req.user.id,
        mode: 'figma'
      });

      // Ensure connected
      if (!mcpClient.initialized) {
        await mcpClient.connect();
      }

      // Call the MCP method
      let result;
      if (method === 'tools/list') {
        result = await mcpClient.listTools();
      } else if (method === 'tools/call') {
        if (!params?.name) {
          throw new Error('Tool name is required');
        }
        result = await mcpClient.callTool(params.name, params.arguments || {});
      } else {
        // Generic request
        result = await mcpClient.sendRequest({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params: params || {}
        });
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('MCP proxy error', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Color Analytics Routes
  try {
    const colorAnalyticsRoutes = await import('../../routes/color-analytics-routes.js');
    app.use('/api/colors', colorAnalyticsRoutes.default);
    console.log('✅ Color analytics routes registered');
  } catch (error) {
    console.warn('⚠️ Failed to load color analytics routes:', error.message);
  }

  // Serve frontend static files (exclude report files)
  // Use process.cwd() for Docker compatibility, but in Electron builds the frontend may live elsewhere.
  // Prefer an explicit env var, then the legacy docker path, then desktop renderer output.
  const resolveFrontendPath = () => {
    const candidates = [];

    // Explicit override (desktop or custom deployments)
    const envPath =
      process.env.DESIGNQA_FRONTEND_DIST ||
      process.env.FRONTEND_DIST_PATH ||
      process.env.VITE_FRONTEND_DIST;
    if (envPath) candidates.push(envPath);

    // Legacy docker path used by the unified server
    candidates.push(path.join(process.cwd(), 'frontend/dist'));
    candidates.push(path.join(process.cwd(), 'apps', 'saas-frontend', 'dist'));
    candidates.push(path.join(process.cwd(), 'apps', 'saas-backend', 'frontend', 'dist'));

    // Electron desktop packaging locations
    if (process.env.RUNNING_IN_ELECTRON === 'true') {
      const resourcesPath = process.resourcesPath || process.cwd();
      candidates.push(path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'renderer'));
      candidates.push(path.join(resourcesPath, 'dist', 'renderer'));
      candidates.push(path.join(resourcesPath, 'app.asar.unpacked', 'saas-backend', 'frontend', 'dist'));
      candidates.push(path.join(resourcesPath, 'saas-backend', 'frontend', 'dist'));
    }

    // Pick the first candidate that contains an index.html
    for (const candidate of candidates) {
      try {
        const index = path.join(candidate, 'index.html');
        if (fs.existsSync(index)) return candidate;
      } catch {
        // ignore
      }
    }

    // Otherwise, pick the first existing directory
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        // ignore
      }
    }

    // Fall back to the legacy value for logging/error messages
    return candidates[0];
  };

  const frontendPath = resolveFrontendPath();

  // Log frontend path for debugging
  // Removed: console.log(`📁 Frontend static path: ${frontendPath}`);
  if (fs.existsSync(frontendPath)) {
    // Removed: console.log(`✅ Frontend dist directory exists`);
    const assetsPath = path.join(frontendPath, 'assets');
    if (fs.existsSync(assetsPath)) {
      const assetFiles = fs.readdirSync(assetsPath);
      // Removed: console.log(`✅ Assets directory exists with ${assetFiles.length} files`);
    } else {
      console.warn(`⚠️ Assets directory missing: ${assetsPath}`);
    }
  } else {
    console.error(`❌ Frontend dist directory missing: ${frontendPath}`);
  }

  // Serve static assets with proper MIME types
  // Serve static assets with proper MIME types
  app.use('/assets', (req, res, next) => {
    // Debug logging for asset requests
    // Removed: console.log(`📂 Asset request: ${req.url}`);
    next();
  }, express.static(path.join(frontendPath, 'assets'), {
    setHeaders: (res, filePath) => {
      // Set correct MIME types
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'text/javascript');
      }
      // Cache headers for assets
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
    fallthrough: false // Force error if file not found (handled by error handler)
  }));

  // IMPORTANT: Report files must be served BEFORE frontend static files
  // to prevent React app from intercepting report URLs

  const outputPath = getOutputBaseDir();

  // Serve frontend assets for report pages (CSS/JS assets)
  app.use('/reports/assets', express.static(path.join(frontendPath, 'assets'), {
    setHeaders: (res, filePath) => {
      // Set correct MIME types for assets served in report context
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
    },
    fallthrough: false // Force error if file not found (handled by error handler)
  }));

  // Serve static report HTML files BEFORE frontend static files
  app.use('/reports', express.static(path.join(outputPath, 'reports'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));

  // Legacy fallback for old local report path
  app.use('/reports', express.static(path.join(process.cwd(), 'apps/saas-backend/output/reports')));

  // Serve other output files (images, screenshots, etc)
  app.use('/output', express.static(outputPath));

  // Serve frontend React app static files AFTER report files
  app.use(express.static(frontendPath, {
    setHeaders: (res, filePath) => {
      // Add cache-busting headers for HTML to prevent cache conflicts
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
    // Don't serve index.html as fallback - let catch-all route handle it
    index: false
  }));
  app.use('/images', express.static(path.join(outputPath, 'images')));
  app.use('/screenshots', express.static(path.join(outputPath, 'screenshots')));

  // Serve CSS styles for reports
  const stylesPath = path.join(__dirname, '../../reporting/styles');
  app.use('/styles', express.static(stylesPath));

  // Initialize MCP connection on startup (if enabled) - non-blocking
  if (!isApiOnlyFigma && figmaClient) {
    // Don't await - let it connect in background
    figmaClient.connect().then(connected => {
      mcpConnected = connected;
      // Removed: console.log(`🔌 MCP connection attempt: ${connected ? 'Connected' : 'Disconnected'}`);
    }).catch(error => {
      console.warn('⚠️ MCP connection failed (non-blocking):', error.message);
      mcpConnected = false;
    });
  }

  // API Routes - Enhanced health endpoint with comprehensive monitoring
  app.get('/api/health', async (req, res) => {
    try {
      const realTimeMetrics = performanceMonitor?.getRealTimeMetrics?.() || {};
      const browserStats = browserPool?.getStats?.() || {};

      // Enhanced health data with service manager integration
      let enhancedHealth = {};
      if (serviceManager) {
        try {
          enhancedHealth = serviceManager.getServicesStatus();
        } catch (e) {
          // Ignore service manager errors
        }
      }

      // Check MCP connection status - prefer bridge client in Electron
      let mcpStatusConnected = !!mcpConnected;
      if (isLocalMode && process.__designqa_mcp_bridge_client) {
        try {
          const bridgeClient = process.__designqa_mcp_bridge_client;
          const ws = bridgeClient.ws || null;
          const wsOpen = ws && typeof ws.readyState !== 'undefined' && ws.readyState === 1;
          mcpStatusConnected = wsOpen && (bridgeClient.initialized || false);
        } catch (e) {
          // Ignore bridge client errors
        }
      }

      res.json({
        success: true,
        status: 'ok',
        mcp: {
          enabled: !isApiOnlyFigma,
          connected: mcpStatusConnected,
          mode: figmaConnectionMode
        },
        webSocket: {
          connected: webSocketManager?.getActiveConnectionsCount?.() > 0 || false,
          activeConnections: webSocketManager?.getActiveConnectionsCount?.() || 0,
          activeComparisons: webSocketManager?.getActiveComparisonsCount?.() || 0,
        },
        browser: {
          pool: browserStats,
          activeExtractions: webExtractorV2?.getActiveExtractions?.() || 0,
        },
        timestamp: new Date().toISOString(),
        performance: realTimeMetrics,
        // Enhanced monitoring data
        enhanced: enhancedHealth
      });
    } catch (error) {
      // Ensure health endpoint never crashes
      console.error('Health check error:', error);
      res.status(200).json({
        success: false,
        status: 'degraded',
        error: error.message || 'Health check error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Desktop bridge health endpoint - minimal response for web app connection detection
  // This endpoint is specifically designed for cross-origin requests from the web app
  app.get('/api/desktop/health', (req, res) => {
    try {
      // Read version from package.json
      let version = '0.0.0';
      const possiblePaths = [
        path.join(process.cwd(), 'package.json'),
        path.join(__dirname, '../../../package.json'),
        path.join(process.resourcesPath || '', 'app/package.json')
      ];

      for (const pkgPath of possiblePaths) {
        try {
          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            version = pkg.version || version;
            break;
          }
        } catch (e) {
          // Continue to next path
        }
      }

      res.json({
        ok: true,
        version,
        platform: process.platform,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(200).json({
        ok: false,
        error: 'Desktop health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Version endpoint for build tracking
  app.get('/api/version', (req, res) => {
    try {
      // Try multiple locations for package.json
      let packageJson;
      const possiblePaths = [
        path.join(process.cwd(), 'package.json'),
        path.join(__dirname, '../../../package.json'),
        path.join(process.resourcesPath || '', 'app/package.json'),
        path.join(process.resourcesPath || '', 'package.json')
      ];

      let foundPath = null;
      for (const pkgPath of possiblePaths) {
        try {
          if (fs.existsSync(pkgPath)) {
            packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            foundPath = pkgPath;
            break;
          }
        } catch (e) {
          // Continue to next path
        }
      }

      if (!packageJson) {
        // Fallback: try reading from root package.json (single source of truth)
        const rootPackagePath = path.join(__dirname, '../../../../package.json');
        try {
          if (fs.existsSync(rootPackagePath)) {
            packageJson = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
            packageJson.name = packageJson.name || 'figma-web-comparison-tool';
          } else {
            // Last resort fallback - try to get from current package.json
            const currentPackagePath = path.join(__dirname, '../../package.json');
            try {
              if (fs.existsSync(currentPackagePath)) {
                packageJson = JSON.parse(fs.readFileSync(currentPackagePath, 'utf8'));
              } else {
                packageJson = { version: '2.0.1', name: 'figma-web-comparison-tool' };
              }
            } catch {
              packageJson = { version: '2.0.1', name: 'figma-web-comparison-tool' };
            }
          }
        } catch (e) {
          // Last resort fallback - try current package.json first
          const currentPackagePath = path.join(__dirname, '../../package.json');
          try {
            if (fs.existsSync(currentPackagePath)) {
              packageJson = JSON.parse(fs.readFileSync(currentPackagePath, 'utf8'));
            } else {
              packageJson = { version: '2.0.1', name: 'figma-web-comparison-tool' };
            }
          } catch {
            packageJson = { version: '2.0.1', name: 'figma-web-comparison-tool' };
          }
        }
      }

      res.json({
        success: true,
        data: {
          version: packageJson.version,
          name: packageJson.name,
          buildTime: new Date().toISOString(),
          phase: 'Phase 13 - Architectural Consolidation Complete',
          architecture: {
            servers: 1,
            extractors: 1,
            mcpClients: 1,
            consolidated: true
          },
          packagePath: foundPath || 'fallback'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get version info',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // New detailed health endpoint
  app.get('/api/health/detailed', (req, res) => {
    try {
      if (!serviceManager) {
        return res.json({
          success: false,
          error: 'Enhanced monitoring not available',
          mode: 'legacy'
        });
      }

      const servicesStatus = serviceManager.getServicesStatus();

      res.json({
        success: true,
        data: {
          ...servicesStatus,
          legacy: {
            mcp: mcpConnected,
            webSocket: {
              connected: webSocketManager.getActiveConnectionsCount() > 0,
              activeConnections: webSocketManager.getActiveConnectionsCount(),
              activeComparisons: webSocketManager.getActiveComparisonsCount(),
            },
            browser: browserPool.getStats(),
            performance: performanceMonitor.getRealTimeMetrics()
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Circuit breaker status endpoint
  app.get('/api/health/circuit-breakers', async (req, res) => {
    try {
      if (!serviceManager) {
        return res.json({
          success: false,
          error: 'Circuit breakers not available',
          mode: 'legacy'
        });
      }

      const { circuitBreakerRegistry } = await import('../resilience/CircuitBreaker.js');

      res.json({
        success: true,
        data: {
          summary: circuitBreakerRegistry.getHealthStatus(),
          details: circuitBreakerRegistry.getAllStats()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Performance monitoring endpoints
   */
  app.get('/api/performance/summary', (req, res) => {
    try {
      const summary = performanceMonitor.getPerformanceSummary();
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error('Failed to get performance summary', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve performance data'
      });
    }
  });

  app.get('/api/performance/realtime', (req, res) => {
    try {
      const metrics = performanceMonitor.getRealTimeMetrics();
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Failed to get real-time metrics', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve real-time metrics'
      });
    }
  });


  /**
   * Auth endpoints
   */
  app.get('/api/auth/me', healthLimiter, async (req, res) => {
    try {
      if (!req.user) {
        return res.json({
          success: false,
          authenticated: false,
          user: null
        });
      }

      res.json({
        success: true,
        authenticated: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          createdAt: req.user.created_at
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Design Systems endpoints
   */
  app.get('/api/design-systems', healthLimiter, async (req, res) => {
    try {
      const { getStorageProvider } = await import('../../config/storage-config.js');
      // Use user ID if authenticated, otherwise use local storage
      const storage = getStorageProvider(req.user?.id || null);

      const filters = {
        userId: req.user?.id,
        isGlobal: req.query.isGlobal === 'true' ? true : req.query.isGlobal === 'false' ? false : undefined
      };

      const systems = await storage.listDesignSystems(filters);

      res.json({
        success: true,
        data: systems || []
      });
    } catch (error) {
      logger.error('Failed to list design systems', { error: error.message });
      // Return empty array instead of 500 error for better UX
      res.json({
        success: true,
        data: []
      });
    }
  });

  app.post('/api/design-systems', healthLimiter, async (req, res) => {
    try {
      // Allow local storage mode (no auth required)
      // Only require auth for global systems or Supabase mode
      if (req.body.isGlobal && !req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required for global design systems'
        });
      }

      // Validate required fields
      if (!req.body.name || !req.body.name.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Design system name is required'
        });
      }

      // Validate tokens if provided
      let tokens = {};
      if (req.body.tokens) {
        if (typeof req.body.tokens === 'string') {
          try {
            tokens = JSON.parse(req.body.tokens);
          } catch (parseError) {
            return res.status(400).json({
              success: false,
              error: `Invalid JSON in tokens: ${parseError.message}`
            });
          }
        } else if (typeof req.body.tokens === 'object') {
          tokens = req.body.tokens;
        } else {
          return res.status(400).json({
            success: false,
            error: 'Tokens must be a valid JSON object'
          });
        }
      }

      const { getStorageProvider } = await import('../../config/storage-config.js');
      // Use user ID if authenticated, otherwise use local storage
      const storage = getStorageProvider(req.user?.id || null);

      if (!storage) {
        throw new Error('Storage provider not available');
      }

      const systemData = {
        name: req.body.name.trim(),
        slug: req.body.slug?.trim(),
        tokens,
        cssUrl: req.body.cssUrl,
        cssText: req.body.cssText,
        figmaFileKey: req.body.figmaFileKey,
        figmaNodeId: req.body.figmaNodeId,
        isGlobal: req.body.isGlobal || false
      };

      const saved = await storage.saveDesignSystem(systemData);

      res.json({
        success: true,
        data: saved
      });
    } catch (error) {
      logger.error('Failed to create design system', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create design system'
      });
    }
  });

  app.get('/api/design-systems/:id', healthLimiter, async (req, res) => {
    try {
      const { getStorageProvider } = await import('../../config/storage-config.js');
      // Use user ID if authenticated, otherwise use local storage
      const storage = getStorageProvider(req.user?.id || null);

      const system = await storage.getDesignSystem(req.params.id);

      res.json({
        success: true,
        data: system
      });
    } catch (error) {
      logger.error('Failed to get design system', { error: error.message });
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  });

  app.put('/api/design-systems/:id', healthLimiter, async (req, res) => {
    try {
      const { getStorageProvider } = await import('../../config/storage-config.js');
      // Use user ID if authenticated, otherwise use local storage
      const storage = getStorageProvider(req.user?.id || null);

      // Get existing system to preserve ID
      const existing = await storage.getDesignSystem(req.params.id);

      // Check if trying to make global without auth
      if (req.body.isGlobal && !req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required for global design systems'
        });
      }

      const systemData = {
        id: existing.id,
        name: req.body.name ?? existing.name,
        slug: req.body.slug ?? existing.slug,
        tokens: req.body.tokens ?? existing.tokens,
        cssUrl: req.body.cssUrl ?? existing.cssUrl,
        cssText: req.body.cssText ?? existing.cssText,
        figmaFileKey: req.body.figmaFileKey ?? existing.figmaFileKey,
        figmaNodeId: req.body.figmaNodeId ?? existing.figmaNodeId,
        isGlobal: req.body.isGlobal ?? existing.isGlobal
      };

      const updated = await storage.saveDesignSystem(systemData);

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      logger.error('Failed to update design system', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.delete('/api/design-systems/:id', healthLimiter, async (req, res) => {
    try {
      const { getStorageProvider } = await import('../../config/storage-config.js');
      // Use user ID if authenticated, otherwise use local storage
      const storage = getStorageProvider(req.user?.id || null);

      const deleted = await storage.deleteDesignSystem(req.params.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Design system not found'
        });
      }

      res.json({
        success: true,
        message: 'Design system deleted'
      });
    } catch (error) {
      logger.error('Failed to delete design system', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/design-systems/:id/css', healthLimiter, async (req, res) => {
    try {
      const { getStorageProvider } = await import('../../config/storage-config.js');
      // Use user ID if authenticated, otherwise use local storage
      const storage = getStorageProvider(req.user?.id || null);

      const css = await storage.getDesignSystemCSS(req.params.id);

      if (!css) {
        return res.status(404).json({
          success: false,
          error: 'CSS not found for this design system'
        });
      }

      // If it's a URL, redirect; otherwise return CSS text
      if (css.startsWith('http')) {
        return res.redirect(css);
      }

      res.setHeader('Content-Type', 'text/css');
      res.send(css);
    } catch (error) {
      logger.error('Failed to get design system CSS', { error: error.message });
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Credentials endpoints
   */
  app.get('/api/credentials', healthLimiter, async (req, res) => {
    try {
      let repo = null;
      try {
        const { getCredentialsRepository } = await import('../../storage/StorageRouter.js');
        repo = getCredentialsRepository();
      } catch (importError) {
        logger.warn('Failed to import StorageRouter:', importError.message);
        return res.status(200).json({ success: true, data: [] });
      }
      
      if (!repo) {
        return res.status(200).json({ success: true, data: [] });
      }
      
      const credentials = await repo.list();
      res.json({
        success: true,
        data: credentials || []
      });
    } catch (error) {
      logger.error('Failed to list credentials', { error: error.message, stack: error.stack });
      // Return empty array instead of error to prevent frontend issues
      res.status(200).json({
        success: true,
        data: []
      });
    }
  });

  app.post('/api/credentials', healthLimiter, async (req, res) => {
    try {
      const { name, url, loginUrl, username, password, notes } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Credential name is required'
        });
      }
      if (!url || !url.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Credential URL is required'
        });
      }

      const { getStorageProvider } = await import('../../config/storage-config.js');
      const storage = getStorageProvider();
      if (!storage) {
        throw new Error('Storage provider not available');
      }
      const saved = await storage.saveCredential(
        {
          name: name.trim(),
          url: url.trim(),
          loginUrl: loginUrl?.trim(),
          username: username?.trim() || '',
          password: password?.trim() || '',
          notes: notes?.trim()
        },
        {}
      );
      res.json({
        success: true,
        data: saved
      });
    } catch (error) {
      logger.error('Failed to create credential', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create credential'
      });
    }
  });

  app.put('/api/credentials/:id', healthLimiter, async (req, res) => {
    try {
      const credentialId = req.params.id;
      const { name, url, loginUrl, username, password, notes } = req.body;

      if (name !== undefined && (!name || !name.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Credential name cannot be empty'
        });
      }
      if (url !== undefined && (!url || !url.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Credential URL cannot be empty'
        });
      }

      const { getStorageProvider } = await import('../../config/storage-config.js');
      const storage = getStorageProvider();
      let existing;
      try {
        existing = await storage.getCredential(credentialId);
      } catch (error) {
        return res.status(404).json({
          success: false,
          error: 'Credential not found'
        });
      }

      if (!storage) {
        throw new Error('Storage provider not available');
      }

      const updated = await storage.saveCredential(
        {
          name: name !== undefined ? name.trim() : existing.name,
          url: url !== undefined ? url.trim() : existing.url,
          loginUrl: loginUrl !== undefined ? (loginUrl?.trim() || null) : existing.loginUrl,
          username: username !== undefined ? username : '',
          password: password !== undefined ? password : '',
          notes: notes !== undefined ? (notes?.trim() || null) : existing.notes
        },
        { id: credentialId }
      );

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      logger.error('Failed to update credential', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update credential'
      });
    }
  });

  app.delete('/api/credentials/:id', healthLimiter, async (req, res) => {
    try {
      const credentialId = req.params.id;
      const { getStorageProvider } = await import('../../config/storage-config.js');
      const storage = getStorageProvider();
      const deleted = await storage.deleteCredential(credentialId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Credential not found'
        });
      }
      res.json({
        success: true,
        message: 'Credential deleted'
      });
    } catch (error) {
      logger.error('Failed to delete credential', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/credentials/:id/decrypt', healthLimiter, async (req, res) => {
    try {
      const credentialId = req.params.id;
      const { getStorageProvider } = await import('../../config/storage-config.js');
      const storage = getStorageProvider();
      const decrypted = await storage.decryptCredential(credentialId);

      res.json({
        success: true,
        data: {
          id: decrypted.id,
          name: decrypted.name,
          url: decrypted.url,
          loginUrl: decrypted.loginUrl,
          username: decrypted.username,
          password: decrypted.password
        }
      });
    } catch (error) {
      logger.error('Failed to decrypt credential', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Settings endpoints
   */
  async function buildSettingsPayload() {
    const apiKey = await getUserFigmaApiKey();
    const maskedKey = apiKey ? '***' + apiKey.slice(-4) : '';
    return {
      mcpServer: {
        url: config.mcp?.url || process.env.MCP_PROXY_URL || 'http://localhost:3001',
        endpoint: config.mcp?.endpoint || process.env.MCP_ENDPOINT || '/sse',
        connected: mcpConnected
      },
      figmaApiKey: maskedKey,
      hasApiKey: !!apiKey
    };
  }

  app.get('/api/settings', healthLimiter, async (req, res) => {
    const payload = await buildSettingsPayload();
    res.json({
      success: true,
      data: payload
    });
  });

  app.get('/api/settings/current', healthLimiter, async (req, res) => {
    const payload = await buildSettingsPayload();
    res.json({
      success: true,
      data: payload
    });
  });

  app.post('/api/settings/save', healthLimiter, async (req, res) => {
    try {
      const { figmaPersonalAccessToken } = req.body;
      const saved = saveFigmaApiKey(figmaPersonalAccessToken);

      if (saved) {
        if (figmaPersonalAccessToken) {
          process.env.FIGMA_API_KEY = figmaPersonalAccessToken;
        } else {
          delete process.env.FIGMA_API_KEY;
        }
        res.json({
          success: true,
          message: 'Figma API key saved locally'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to save Figma API key locally'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Failed to save settings: ${error.message}`
      });
    }
  });

  app.get('/api/storage/location', healthLimiter, async (req, res) => {
    try {
      const baseDir = getOutputBaseDir();
      res.json({
        success: true,
        data: {
          path: baseDir,
          credentials: path.join(baseDir, 'credentials'),
          siteProfiles: path.join(baseDir, 'site-profiles'),
          designSystems: path.join(baseDir, 'design-systems'),
          reports: path.join(baseDir, 'reports'),
          sessions: path.join(baseDir, 'sessions')
        }
      });
    } catch (error) {
      logger.error('Failed to read storage location', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to determine local storage path'
      });
    }
  });

  app.post('/api/diagnostics/export', healthLimiter, async (req, res) => {
    try {
      const baseDir = getOutputBaseDir();
      res.json({
        success: true,
        message: 'Diagnostics snapshot generated locally',
        data: {
          location: baseDir
        }
      });
    } catch (error) {
      logger.error('Failed to export diagnostics', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to export diagnostics'
      });
    }
  });

  app.post('/api/settings/test-connection', healthLimiter, async (req, res) => {
    try {
      const { figmaPersonalAccessToken } = req.body;

      // Use provided token or load from config/user
      const apiKey = figmaPersonalAccessToken || await getUserFigmaApiKey(req.user?.id);

      if (!apiKey) {
        return res.json({
          success: false,
          error: 'No Figma API key provided. Please enter your Figma Personal Access Token.',
          type: 'no-token'
        });
      }

      // Test Figma API
      try {
        const testResponse = await fetch('https://api.figma.com/v1/me', {
          headers: {
            'X-Figma-Token': apiKey
          }
        });

        if (testResponse.ok) {
          const userData = await testResponse.json();

          // Save the API key if it was provided in the request
          if (figmaPersonalAccessToken) {
            saveFigmaApiKey(figmaPersonalAccessToken);
          }

          res.json({
            success: true,
            message: `Connected to Figma API as ${userData.email || 'user'}`,
            type: 'figma-api',
            user: userData.email
          });
        } else {
          const errorData = await testResponse.json();
          res.json({
            success: false,
            error: `Figma API error: ${errorData.err || testResponse.statusText}`,
            type: 'invalid-token'
          });
        }
      } catch (apiError) {
        res.json({
          success: false,
          error: `Figma API connection failed: ${apiError.message}`,
          type: 'api-error'
        });
      }

    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Connection test failed: ${error.message}`
      });
    }
  });

  /**
   * Figma extraction endpoint using unified extractor
   */
  app.post('/api/figma-only/extract',
    extractionLimiter,
    validateExtractionUrl(config.security.allowedHosts),
    async (req, res, next) => {
      try {
        const { figmaUrl, extractionMode = 'both', preferredMethod = null } = req.body;

        // Check if we're in local mode and MCP is required
        const isLocalMode = process.env.RUNNING_IN_ELECTRON === 'true' ||
          (!process.env.RENDER && !process.env.VERCEL);

        if (isLocalMode && preferredMethod !== 'api') {
          // Check Desktop MCP connection status
          try {
            const { getMCPClient } = await import('../../config/mcp-config.js');
            const mcpClient = await getMCPClient({ mode: 'desktop', autoDetectDesktop: false });

            if (!mcpClient) {
              const mcpUrl = process.env.FIGMA_DESKTOP_MCP_URL || (process.env.FIGMA_MCP_PORT ? `http://127.0.0.1:${process.env.FIGMA_MCP_PORT}/mcp` : null);
              return res.status(400).json({
                success: false,
                error: 'Desktop Figma MCP not initialized. Ensure Figma Desktop is running and Desktop MCP is enabled.',
                message: 'Desktop MCP required but not available'
                ,
                details: mcpUrl ? `Expected Desktop MCP URL: ${mcpUrl}` : 'Set FIGMA_MCP_PORT=3845 or FIGMA_DESKTOP_MCP_URL'
              });
            }

            // Ensure it's connected (works for both HTTP MCP client and legacy DesktopMCPClient)
            if (!mcpClient.initialized) {
              const connected = await mcpClient.connect();
              if (!connected || !mcpClient.initialized) {
                return res.status(400).json({
                  success: false,
                  error: 'Desktop Figma MCP not connected',
                  message: 'Desktop MCP is not connected. Ensure Figma Desktop is running and MCP is enabled.'
                });
              }
            }
          } catch (mcpError) {
            console.error('[MCP] Connection check failed:', mcpError);
            return res.status(400).json({
              success: false,
              error: 'Desktop Figma MCP not available',
              message: `MCP connection check failed: ${mcpError.message}`
            });
          }
        }

        // Use unified extractor
        const { UnifiedFigmaExtractor } = await import('../../shared/extractors/UnifiedFigmaExtractor.js');
        const extractor = new UnifiedFigmaExtractor(config);

        // Extract data using best available method
        const apiKey = await getUserFigmaApiKey(req.user?.id);
        const extractionResult = await extractor.extract(figmaUrl, {
          preferredMethod,
          timeout: 30000,
          apiKey: apiKey,
          userId: req.user?.id
        });

        if (!extractionResult.success) {
          const message = extractionResult.error || 'Extraction failed';
          const isDesktopSelectionIssue =
            process.env.RUNNING_IN_ELECTRON === 'true' &&
            /desktop mcp/i.test(message) &&
            (/select the target frame\/component/i.test(message) || /current selection/i.test(message));

          // Determine appropriate status code based on error type
          const isAuthError = /token/i.test(message) || /unauthorized/i.test(message) || /authentication/i.test(message);
          const isConfigError = /configuration/i.test(message) || /setup/i.test(message);

          let statusCode = 500; // Default to server error
          if (isDesktopSelectionIssue) {
            statusCode = 400; // Bad Request for desktop selection issues
          } else if (isAuthError) {
            statusCode = 401; // Unauthorized for token/auth issues
          } else if (isConfigError) {
            statusCode = 422; // Unprocessable Entity for configuration issues
          } else {
            statusCode = 400; // Bad Request for other client errors
          }

          return res.status(statusCode).json({
            success: false,
            error: message,
            details: isDesktopSelectionIssue
              ? 'Open the Figma file in Figma Desktop, enable Dev Mode, and select the target frame/component, then retry.'
              : undefined
          });
        }

        const standardizedData = extractionResult.data;

        // Generate HTML report for Figma extraction
        const reportGenerator = await import('../../reporting/index.js');
        let reportPath = null;

        try {
          const reportData = {
            figmaData: {
              fileName: standardizedData.metadata.fileName,
              extractedAt: standardizedData.extractedAt,
              components: standardizedData.components,
              metadata: standardizedData.metadata
            },
            webData: {
              url: '',
              elements: [],
              colorPalette: [],
              typography: { fontFamilies: [], fontSizes: [], fontWeights: [] }
            },
            timestamp: new Date().toISOString(),
            metadata: {
              extractionType: 'figma-only',
              componentsExtracted: standardizedData.components.length,
              timestamp: new Date().toISOString()
            }
          };

          reportPath = await reportGenerator.generateReport(reportData, {
            filename: `figma-extraction-${Date.now()}.html`
          });

          // Removed: console.log(`📄 HTML report generated: ${reportPath}`);
        } catch (reportError) {
          console.warn('⚠️ HTML report generation failed:', reportError.message);
          console.warn('Report Error Stack:', reportError.stack);
        }

        // Count all components recursively
        const countAllComponents = (components) => {
          let count = 0;
          components.forEach(component => {
            count += 1;
            if (component.children && component.children.length > 0) {
              count += countAllComponents(component.children);
            }
          });
          return count;
        };

        const totalComponentCount = countAllComponents(standardizedData.components);

        // Ensure metadata is properly constructed even if standardizedData.metadata is null
        const metadata = {
          ...(standardizedData.metadata || {}), // Handle null metadata gracefully
          componentCount: totalComponentCount, // Use actual count
          colorCount: standardizedData.colors?.length || 0, // Use actual count with fallback
          typographyCount: standardizedData.typography?.length || 0, // Use actual count with fallback
          extractedAt: new Date().toISOString(),
          source: standardizedData.extractionMethod || 'figma-mcp'
        };

        // console.log('🔍 Figma extraction metadata debug:', {
        //   originalMetadata: standardizedData.metadata,
        //   colorsLength: standardizedData.colors?.length,
        //   constructedMetadata: metadata
        // });

        res.json({
          success: true,
          data: {
            ...standardizedData,
            componentCount: totalComponentCount, // Override with actual recursive count
            extractionMethod: standardizedData.extractionMethod, // Ensure it's at root level
            metadata,
            reportPath: reportPath ? `/reports/${reportPath.split('/').pop()}` : null,
            reports: reportPath ? {
              directUrl: `/reports/${reportPath.split('/').pop()}`,
              downloadUrl: `/reports/${reportPath.split('/').pop()}?download=true`,
              hasError: false
            } : null
          }
        });
      } catch (error) {
        next(error);
      }
    });

  /**
   * Web extraction endpoint (legacy route)
   * @deprecated Use /api/web/extract-v3 instead
   */
  app.post('/api/web/extract', async (req, res) => {
    console.warn('⚠️ DEPRECATED: /api/web/extract will be removed. Use /api/web/extract-v3');
    res.setHeader('X-Deprecated-Endpoint', 'true');
    let webExtractor = null;

    // Track this extraction to prevent SIGTERM interruption
    if (global.trackExtraction) {
      global.trackExtraction.start();
    }

    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required'
        });
      }

      // Removed: console.log(`🔗 Starting web extraction for: ${url}`);

      // Use the unified extractor instead of creating a new instance
      webExtractor = unifiedWebExtractor;

      // Ensure extractor is initialized
      if (!webExtractor.isReady()) {
        await webExtractor.initialize();
      }

      // Extract web data (no authentication for legacy endpoint)
      const rawWebData = await webExtractor.extractWebData(url);

      // Ensure all async operations complete before cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      return res.json({
        success: true,
        data: rawWebData
      });

    } catch (error) {
      console.error('❌ Web extraction failed:', error.message);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      // Mark extraction as completed (cleanup is handled by unified extractor internally)
      if (global.trackExtraction) {
        global.trackExtraction.end();
        // Removed: console.log(`✅ Extraction completed. Active extractions: ${global.trackExtraction.getActive()}`);
      }
    }
  });

  /**
   * Web extraction endpoint
   */
  app.post('/api/web-only/extract', async (req, res) => {

    try {
      const { webUrl, authentication } = req.body;
      const targetUrl = webUrl || req.body.url;

      if (!targetUrl) {
        return res.status(400).json({
          success: false,
          error: 'Web URL is required'
        });
      }

      // Removed: console.log(`🔗 Starting web-only extraction for: ${targetUrl}`);

      // Route web-only extractions through the unified extractor for robustness
      const isFreightTiger = targetUrl.includes('freighttiger.com');
      const includeScreenshot =
        req.body.includeVisual === true ||
        req.body.includeScreenshot === true ||
        req.body.includeVisualComparison === true;
      const unifiedOptions = {
        authentication,
        includeScreenshot,
        viewport: { width: 1920, height: 1080 },
        timeout: isFreightTiger ? Math.max(config.timeouts.webExtraction, 120000) : config.timeouts.webExtraction
      };

      const { options: resolvedOptions, profile } = await resolveExtractionOptions(targetUrl, unifiedOptions);
      const webData = await unifiedWebExtractor.extractWebData(targetUrl, resolvedOptions);
      attachSiteProfileMetadata(webData, profile);
      const elementsCount = webData?.elements?.length || 0;
      if (elementsCount === 0) {
        return res.status(422).json({
          success: false,
          error: 'Web extraction returned 0 DOM elements.',
          details: 'This is usually caused by a login wall, bot-detection, or content rendered inside restricted iframes/shadow DOM. Enable screenshots to inspect what rendered.',
          data: {
            url: webData?.url || targetUrl,
            extractedAt: webData?.extractedAt,
            duration: webData?.duration,
            metadata: webData?.metadata || undefined,
            screenshot: webData?.screenshot?.data
              ? `data:image/${webData.screenshot.type || 'png'};base64,${webData.screenshot.data}`
              : undefined
          }
        });
      }

      // Generate HTML report for web extraction
      const reportGenerator = await import('../../reporting/index.js');
      let reportPath = null;

      try {
        // Create a properly structured report data for web-only extractions
        const elements = webData.elements || [];
        const colorPalette = webData.colorPalette || [];
        const typography = webData.typography || { fontFamilies: [], fontSizes: [], fontWeights: [] };

        const reportData = {
          figmaData: {
            fileName: `Web Extraction Report for ${new URL(targetUrl).hostname}`,
            extractedAt: new Date().toISOString(),
            components: [],
            metadata: {}
          },
          webData: {
            url: webData.url || targetUrl,
            extractedAt: webData.extractedAt || new Date().toISOString(),
            elements: elements,
            colorPalette: colorPalette,
            typography: typography,
            screenshot: webData.screenshot
          },
          summary: {
            componentsAnalyzed: elements.length,
            overallMatchPercentage: 100.00, // For web-only, everything is "matched"
            overallSeverity: 'info',
            matchStats: {
              colors: {
                matched: colorPalette.length,
                total: colorPalette.length,
                percentage: 100
              },
              typography: {
                matched: typography.fontFamilies?.length || 0,
                total: typography.fontFamilies?.length || 0,
                percentage: 100
              }
            },
            severityCounts: {
              high: 0,
              medium: 0,
              low: 0
            }
          },
          comparisons: [], // No comparisons for web-only extraction
          timestamp: new Date().toISOString(),
          metadata: {
            extractionType: 'web-only',
            elementsExtracted: elements.length,
            timestamp: new Date().toISOString()
          }
        };

        reportPath = await reportGenerator.generateReport(reportData, {
          filename: `web-extraction-${Date.now()}.html`
        });

        // Removed: console.log(`📄 HTML report generated: ${reportPath}`);
      } catch (reportError) {
        console.warn('⚠️ HTML report generation failed:', reportError.message);
        console.warn('Report Error Stack:', reportError.stack); // Log stack for debugging
        // Do not block the main response if report generation fails
      }

      return res.json({
        success: true,
        data: {
          elements: (webData.elements || []).map(element => ({
            ...element,
            tag: element.type, // Frontend expects 'tag' field
            classes: element.className ? element.className.split(' ').filter(c => c) : [] // Frontend expects 'classes' array
          })),
          colorPalette: webData.colorPalette || [],
          typography: webData.typography || { fontFamilies: [], fontSizes: [], fontWeights: [] },
          metadata: {
            url: webData.url || webUrl,
            timestamp: webData.extractedAt || new Date().toISOString(),
            elementsExtracted: webData.elements?.length || 0
          },
          screenshot: webData.screenshot?.data ? `data:image/${webData.screenshot.type || 'png'};base64,${webData.screenshot.data}` : undefined,
          reportPath: reportPath ? `/reports/${path.basename(reportPath)}` : null,
          reports: reportPath ? {
            directUrl: `/reports/${path.basename(reportPath)}`,
            downloadUrl: `/reports/${path.basename(reportPath)}?download=true`,
            hasError: false
          } : null
        }
      });

    } catch (error) {
      console.error('❌ Web-only extraction failed:', error.message);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Comparison endpoint
   */
  app.post('/api/compare', async (req, res) => {
    // Immediate stdout write for terminal visibility
    process.stdout.write('🚀 COMPARE ENDPOINT HIT - Request received\n');
    // Removed: console.log('🚀 COMPARE ENDPOINT HIT - Request received');
    // Removed: console.log('🔍 Request body keys:', Object.keys(req.body));
    // Removed: console.log('🔍 Authentication in body:', !!req.body.authentication);

    try {
      const { figmaUrl, webUrl, includeVisual = false, nodeId, designSystemId } = req.body;

      if (!figmaUrl || !webUrl) {
        process.stdout.write('❌ Validation failed: Missing Figma or Web URL\n');
        return res.status(400).json({
          success: false,
          error: 'Both Figma URL and Web URL are required'
        });
      }

      // Extract data from both sources using the same method as single source
      process.stdout.write(`📊 Starting comparison: Figma=${figmaUrl.substring(0, 50)}... | Web=${webUrl.substring(0, 50)}...\n`);
      logger.info('Starting data extraction', { figmaUrl, webUrl });
      const startTime = Date.now();

      const figmaStartTime = Date.now();
      process.stdout.write('🎨 Starting Figma extraction...\n');
      let figmaData = null;
      try {
        // Removed: console.log('🎨 Using UnifiedFigmaExtractor for comparison (same as single source)');
        // Removed: console.log('🎯 NodeId from request:', nodeId || 'No nodeId - extracting full file');
        process.stdout.write(`🎯 Extracting ${nodeId ? 'specific node' : 'full file'} from Figma\n`);

        // Use unified extractor - SAME AS SINGLE SOURCE
        const { UnifiedFigmaExtractor } = await import('../../shared/extractors/UnifiedFigmaExtractor.js');
        const extractor = new UnifiedFigmaExtractor(config);

        // Extract data using best available method (MCP first, API fallback)
        const extractionResult = await extractor.extract(figmaUrl, {
          preferredMethod: 'both',
          fallbackEnabled: true,
          timeout: 30000,
          apiKey: await getUserFigmaApiKey(req.user?.id),
          userId: req.user?.id,
          nodeId: nodeId,  // Pass nodeId for specific component extraction
          designSystemId
        });

        if (!extractionResult.success) {
          throw new Error(extractionResult.error || 'Extraction failed');
        }

        const standardizedData = extractionResult.data;

        if (standardizedData && standardizedData.components) {
          // Use the SAME structure as single extraction endpoint
          figmaData = {
            ...standardizedData,  // Include ALL standardized data fields
            componentCount: standardizedData.componentCount || standardizedData.components.length,
            componentsCount: standardizedData.componentCount || standardizedData.components.length, // Legacy compatibility
            // Ensure these fields are explicitly available
            components: standardizedData.components,
            colors: standardizedData.colors || [],
            typography: standardizedData.typography || [],
            metadata: standardizedData.metadata,
            extractionMethod: standardizedData.extractionMethod
          };

          // Colors extracted successfully

          const figmaDuration = Date.now() - figmaStartTime;
          process.stdout.write(`✅ Figma extraction completed in ${figmaDuration}ms\n`);
          console.log('✅ Figma extraction successful via UnifiedFigmaExtractor');
          // console.log('📊 Figma data summary:', {
          //   components: figmaData.components?.length || 0,
          //   componentCount: figmaData.componentCount,
          //   colors: figmaData.colors?.length || 0,
          //   typography: figmaData.typography?.length || 0,
          //   extractionMethod: figmaData.extractionMethod,
          //   fileName: standardizedData.metadata?.fileName || 'Unknown'
          // });
          process.stdout.write(`📊 Figma: ${figmaData.components?.length || 0} components, ${figmaData.colors?.length || 0} colors, ${figmaData.typography?.length || 0} typography entries\n`);
        } else {
          throw new Error('Figma extraction returned no components');
        }
      } catch (figmaError) {
        process.stdout.write(`❌ Figma extraction failed: ${figmaError.message}\n`);
        console.log('❌ Figma extraction failed:', figmaError.message);
        const message = figmaError.message || String(figmaError);
        const isDesktopSelectionIssue =
          process.env.RUNNING_IN_ELECTRON === 'true' &&
          /desktop mcp/i.test(message) &&
          (/select the target frame\/component/i.test(message) || /current selection/i.test(message));

        // Determine appropriate status code based on error type
        const isAuthError = /token/i.test(message) || /unauthorized/i.test(message) || /authentication/i.test(message);
        const isConfigError = /configuration/i.test(message) || /setup/i.test(message);

        let statusCode = 500; // Default to server error
        if (isDesktopSelectionIssue) {
          statusCode = 400; // Bad Request for desktop selection issues
        } else if (isAuthError) {
          statusCode = 401; // Unauthorized for token/auth issues
        } else if (isConfigError) {
          statusCode = 422; // Unprocessable Entity for configuration issues
        } else {
          statusCode = 400; // Bad Request for other client errors
        }

        return res.status(statusCode).json({
          success: false,
          error: `Figma extraction failed: ${message}`,
          details: isDesktopSelectionIssue
            ? 'Open the Figma file in Figma Desktop, enable Dev Mode, and select the target frame/component, then retry.'
            : undefined
        });
      }
      const figmaDuration = Date.now() - figmaStartTime;
      performanceMonitor.trackExtraction('Figma', figmaDuration, { url: figmaUrl });

      const webStartTime = Date.now();
      process.stdout.write('🌐 Starting Web extraction...\n');
      let webData;

      const redactSensitive = (value) => {
        if (!value || typeof value !== 'object') return value;
        const clone = Array.isArray(value) ? [...value] : { ...value };
        const sensitiveKeys = new Set([
          'password',
          'token',
          'access_token',
          'refresh_token',
          'apiKey',
          'api_key',
          'authorization',
          'cookie',
          'cookies'
        ]);
        for (const key of Object.keys(clone)) {
          if (sensitiveKeys.has(key.toLowerCase())) {
            clone[key] = '[REDACTED]';
            continue;
          }
          clone[key] = redactSensitive(clone[key]);
        }
        return clone;
      };

      // Avoid logging credentials/tokens (these requests can contain passwords).
      // console.log('🔍 Compare request:', JSON.stringify({
      //   figmaUrl,
      //   webUrl,
      //   includeVisual,
      //   nodeId,
      //   extractionMode: req.body.extractionMode,
      //   hasAuth: Boolean(req.body.authentication),
      //   options: redactSensitive(req.body.options || {})
      // }, null, 2));

      // DEBUG: Log full request body structure for authentication debugging
      console.log('🔍 Request body keys:', Object.keys(req.body));
      console.log('🔍 Authentication field:', JSON.stringify(req.body.authentication, null, 2));

      // Extract authentication from request body if available
      const authentication = req.body.authentication?.webAuth ? {
        type: 'form',
        username: req.body.authentication.webAuth.username,
        password: req.body.authentication.webAuth.password
      } : req.body.authentication && req.body.authentication.type ? {
        type: req.body.authentication.type,
        username: req.body.authentication.username,
        password: req.body.authentication.password,
        loginUrl: req.body.authentication.loginUrl,
        waitTime: req.body.authentication.waitTime,
        successIndicator: req.body.authentication.successIndicator
      } : null;

      console.log('🔧 Using UnifiedWebExtractor for comparison with auth:', authentication ? 'enabled' : 'disabled');
      // Removed: console.log('🔍 Parsed authentication:', JSON.stringify(redactSensitive(authentication), null, 2));

      const freightTigerUrl = webUrl.includes('freighttiger.com');
      const requestedTimeout = req.body.options?.timeout;
      const configuredTimeout = config?.timeouts?.webExtraction;
      let comparisonTimeout = requestedTimeout
        || (freightTigerUrl ? 600000 : (configuredTimeout || 120000));
      // Allow desktop users to override timeouts via env/config without rebuilding the frontend.
      if (configuredTimeout && configuredTimeout > comparisonTimeout) {
        comparisonTimeout = configuredTimeout;
      }

      // Keep a small buffer so the backend can respond before client-side timeouts fire.
      const extractionTimeout = Math.max(10000, Number(comparisonTimeout) - 5000);

      const extractionOptions = {
        authentication,
        timeout: extractionTimeout,
        // Default off for speed; enable only when troubleshooting.
        includeScreenshot: process.env.DEBUG_WEB_SCREENSHOTS === 'true',
        stabilityTimeout: freightTigerUrl ? 60000 : 5000,
        designSystemId
      };

      const { options: resolvedExtractionOptions, profile: appliedProfile } =
        await resolveExtractionOptions(webUrl, extractionOptions);

      const attemptWebExtraction = async (label = 'primary') => {
        process.stdout.write(`🌐 Web extraction attempt (${label}) with timeout ${extractionTimeout}ms\n`);
        // Removed: console.log(`🌐 Web extraction attempt (${label}) with timeout ${extractionTimeout}ms`);
        return unifiedWebExtractor.extractWebData(webUrl, resolvedExtractionOptions);
      };

      try {
        process.stdout.write(`🔧 Authentication: ${authentication ? 'enabled' : 'disabled'}\n`);
        // Removed: console.log(`🔧 Using authentication: ${authentication ? 'enabled' : 'disabled'}`);
        webData = await attemptWebExtraction();
        attachSiteProfileMetadata(webData, appliedProfile);
      } catch (webError) {
        const message = webError?.message || '';
        const canRetry = /Page was closed before extraction could begin/i.test(message) ||
          /Extraction aborted due to timeout/i.test(message);

        if (canRetry) {
          process.stdout.write(`⚠️ Web extraction aborted early, retrying...\n`);
          console.warn(`⚠️ Web extraction aborted early (${message}). Retrying once with fresh session...`);
          // Give the browser pool a brief moment to recycle pages
          await new Promise(resolve => setTimeout(resolve, 1500));
          webData = await attemptWebExtraction('retry');
          attachSiteProfileMetadata(webData, appliedProfile);
        } else {
          process.stdout.write(`❌ Web extraction failed: ${message}\n`);
          console.error('❌ Web extraction failed:', message);
          throw webError;
        }
      }

      const webDuration = Date.now() - webStartTime;
      process.stdout.write(`✅ Web extraction completed in ${webDuration}ms: ${webData.elements?.length || 0} elements\n`);
      console.log('✅ Web extraction completed:', webData.elements?.length || 0, 'elements');
      // console.log('📊 Web data summary:', {
      //   elements: webData.elements?.length || 0,
      //   colors: webData.colorPalette?.length || 0,
      //   fontFamilies: webData.typography?.fontFamilies?.length || 0,
      //   fontSizes: webData.typography?.fontSizes?.length || 0,
      //   spacing: webData.spacing?.length || 0,
      //   borderRadius: webData.borderRadius?.length || 0
      // });
      process.stdout.write(`📊 Web: ${webData.elements?.length || 0} elements, ${webData.colorPalette?.length || 0} colors, ${webData.typography?.fontFamilies?.length || 0} fonts\n`);

      // Debug: Sample extracted data
      if (webData.colorPalette?.length > 0) {
        // Removed: console.log('🎨 Sample colors:', webData.colorPalette.slice(0, 3));
      }
      if (webData.typography?.fontFamilies?.length > 0) {
        // Removed: console.log('📝 Sample fonts:', webData.typography.fontFamilies.slice(0, 3));
      }
      if (webData.spacing?.length > 0) {
        // Removed: console.log('📏 Sample spacing:', webData.spacing.slice(0, 3));
      }

      performanceMonitor.trackExtraction('Web', webDuration, { url: webUrl });

      const webElementsCount = webData?.elements?.length || 0;
      if (webElementsCount === 0) {
        return res.status(422).json({
          success: false,
          error: 'Web extraction returned 0 DOM elements.',
          details: 'This is usually caused by a login wall, bot-detection, or content rendered inside restricted iframes/shadow DOM. Check the screenshot output to see what actually rendered.',
          data: {
            url: webData?.url || webUrl,
            extractedAt: webData?.extractedAt,
            duration: webData?.duration,
            metadata: webData?.metadata || undefined,
            screenshot: webData?.screenshot?.data
              ? `data:image/${webData.screenshot.type || 'png'};base64,${webData.screenshot.data}`
              : undefined
          }
        });
      }

      logger.extraction('Figma', figmaUrl, figmaData);
      logger.extraction('Web', webUrl, webData);

      // Compare the data
      const comparisonStartTime = Date.now();
      process.stdout.write(`⚖️ Starting comparison: ${figmaData.components?.length || 0} Figma components vs ${webData.elements?.length || 0} Web elements\n`);
      // console.log('🔄 Starting comparison with data:', {
      //   figmaComponents: figmaData.components?.length || 0,
      //   webElements: webData.elements?.length || 0
      // });

      const comparison = await comparisonEngine.compareDesigns(figmaData, webData, { designSystemId });
      const comparisonDuration = Date.now() - comparisonStartTime;

      process.stdout.write(`✅ Comparison completed in ${comparisonDuration}ms\n`);
      console.log('✅ Comparison completed:', {
        totalComparisons: comparison.comparisons?.length || 0,
        totalMatches: comparison.summary?.totalMatches || 0,
        totalDeviations: comparison.summary?.totalDeviations || 0
      });
      process.stdout.write(`📊 Comparison results: ${comparison.comparisons?.length || 0} comparisons, ${comparison.summary?.totalMatches || 0} matches, ${comparison.summary?.totalDeviations || 0} deviations\n`);

      const totalDuration = Date.now() - startTime;
      process.stdout.write(`🎉 Full comparison pipeline completed in ${totalDuration}ms\n`);
      performanceMonitor.trackComparison(comparisonDuration, {
        figmaComponents: figmaData?.components?.length || 0,
        webElements: webData?.elements?.length || 0,
        totalDuration
      });

      logger.performance('Full comparison pipeline', totalDuration);
      logger.comparison(comparison);

      // Generate HTML report for comparison
      const reportGenerator = await import('../../reporting/index.js');
      let reportPath = null;

      try {
        const reportData = {
          figmaData: {
            fileName: figmaData.fileName || 'Figma Design',
            extractedAt: new Date().toISOString(),
            components: figmaData.components || [],
            metadata: figmaData.metadata || {}
          },
          webData: {
            url: webUrl,
            extractedAt: new Date().toISOString(),
            elements: webData.elements || [],
            colorPalette: webData.colorPalette || [],
            typography: webData.typography || { fontFamilies: [], fontSizes: [], fontWeights: [] },
            screenshot: webData.screenshot
          },
          comparisons: comparison.comparisons || [],
          summary: {
            componentsAnalyzed: figmaData?.components?.length || 0,
            overallMatchPercentage: comparison.overallMatch || 0,
            overallSeverity: comparison.severity || 'info',
            matchStats: comparison.matchStats || {},
            severityCounts: comparison.summary?.severity || { high: 0, medium: 0, low: 0 }
          },
          timestamp: new Date().toISOString(),
          metadata: {
            extractionType: 'comparison',
            comparedAt: new Date().toISOString(),
            figmaComponentCount: figmaData?.components?.length || 0,
            webElementCount: webData?.elements?.length || 0
          }
        };

        reportPath = await reportGenerator.generateReport(reportData, {
          filename: `comparison-${Date.now()}.html`
        });

        // Removed: console.log(`📄 HTML report generated: ${reportPath}`);
      } catch (reportError) {
        console.warn('⚠️ HTML report generation failed:', reportError.message);
        console.warn('Report Error Stack:', reportError.stack);
      }

      // Figma extraction completed successfully

      // Generate unique comparison ID for saving reports
      let comparisonId = `cmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      // Removed: console.log(`📋 Generated comparison ID: ${comparisonId}`);

      // Save comparison to database if services available
      if (dbServices) {
        try {
          const savedComparison = await dbServices.comparisons.createComparison({
            userId: req.user?.id || null,
            figmaUrl,
            webUrl,
            credentialId: req.body.credentialId || null,
            status: 'completed',
            result: comparison,
            durationMs: totalDuration,
            progress: 100
          });
          comparisonId = savedComparison.id;
          // Removed: console.log(`✅ Comparison saved to database: ${comparisonId}`);
        } catch (dbError) {
          console.warn('⚠️ Failed to save comparison to database:', dbError.message);
        }
      }

      // Prepare extraction details for frontend
      const extractionDetails = {
        figma: {
          componentCount: figmaData?.components?.length || 0,
          colors: figmaData?.colors || [],
          typography: {
            fontFamilies: [...new Set((figmaData?.typography || []).map(t => t.fontFamily).filter(Boolean))],
            fontSizes: [...new Set((figmaData?.typography || []).map(t => t.fontSize ? `${t.fontSize}px` : null).filter(Boolean))],
            fontWeights: [...new Set((figmaData?.typography || []).map(t => t.fontWeight?.toString()).filter(Boolean))]
          },
          extractionTime: figmaDuration,
          fileInfo: {
            name: figmaData?.fileName || 'Unknown',
            nodeId: figmaData?.nodeId
          }
        },
        web: {
          elementCount: webData?.elements?.length || 0,
          colors: (webData?.colors || webData?.colorPalette || []).map(color => {
            // Convert RGB colors to hex format for consistency
            if (typeof color === 'string' && color.startsWith('rgb(')) {
              const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              if (match) {
                const [, r, g, b] = match;
                return `#${parseInt(r).toString(16).padStart(2, '0')}${parseInt(g).toString(16).padStart(2, '0')}${parseInt(b).toString(16).padStart(2, '0')}`;
              }
            }
            // Handle RGBA colors
            if (typeof color === 'string' && color.startsWith('rgba(')) {
              const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
              if (match) {
                const [, r, g, b, a] = match;
                const alpha = parseFloat(a);
                if (alpha === 1) {
                  // Full opacity, convert to hex
                  return `#${parseInt(r).toString(16).padStart(2, '0')}${parseInt(g).toString(16).padStart(2, '0')}${parseInt(b).toString(16).padStart(2, '0')}`;
                }
                // Keep RGBA for transparency
                return color;
              }
            }
            return color; // Return as-is if already hex or other format
          }),
          typography: {
            fontFamilies: webData?.typography?.fontFamilies || [],
            fontSizes: webData?.typography?.fontSizes || [],
            fontWeights: webData?.typography?.fontWeights || []
          },
          spacing: webData?.spacing || [],
          borderRadius: webData?.borderRadius || [],
          extractionTime: webDuration,
          urlInfo: {
            url: webUrl,
            title: webData?.metadata?.title
          }
        },
        comparison: {
          totalComparisons: comparison?.comparisons?.length || 0,
          matches: comparison?.summary?.totalMatches || 0,
          deviations: comparison?.summary?.totalDeviations || 0,
          matchPercentage: comparison?.overallMatch || 0
        }
      };

      // Add component counts to the response data
      const responseData = {
        // Comparison identifier for saving reports
        comparisonId,
        id: comparisonId, // Alias for backwards compatibility

        figmaData: {
          ...figmaData,
          // STANDARDIZED FIELDS (preferred)
          componentCount: figmaData?.components?.length || 0, // Standard field name

          // Transform typography to include aggregated data for UI
          typography: {
            ...figmaData?.typography, // Keep original array
            fontFamilies: [...new Set((figmaData?.typography || [])
              .map(t => t.fontFamily)
              .filter(f => f && f !== 'Unknown' && f !== 'unknown'))], // Filter out Unknown
            fontSizes: [...new Set((figmaData?.typography || [])
              .map(t => t.fontSize ? `${t.fontSize}px` : null)
              .filter(Boolean))],
            fontWeights: [...new Set((figmaData?.typography || [])
              .map(t => t.fontWeight?.toString())
              .filter(Boolean))]
          },

          // LEGACY FIELDS (maintained for backward compatibility)
          componentsCount: figmaData?.components?.length || 0 // Keep for compatibility
        },
        webData: {
          ...(includeVisual ? webData : { ...webData, screenshot: null }),
          // STANDARDIZED FIELDS (preferred)
          elementCount: webData?.elements?.length || 0, // Standard field name

          // LEGACY FIELDS (maintained for backward compatibility)
          elementsCount: webData?.elements?.length || 0 // Keep for compatibility
        },
        comparison,
        metadata: {
          comparedAt: new Date().toISOString(),
          includeVisual,
          version: '1.0.0',

          // STANDARDIZED FIELDS (preferred)
          figmaComponentCount: figmaData?.components?.length || 0, // Standard field name
          webElementCount: webData?.elements?.length || 0, // Standard field name

          // LEGACY FIELDS (maintained for backward compatibility)
          figmaComponentsCount: figmaData?.components?.length || 0, // Keep for compatibility
          webElementsCount: webData?.elements?.length || 0 // Keep for compatibility
        },
        reportPath: reportPath ? `/reports/${reportPath.split('/').pop()}` : null,
        reports: reportPath ? {
          directUrl: `/reports/${reportPath.split('/').pop()}`,
          downloadUrl: `/reports/${reportPath.split('/').pop()}?download=true`,
          hasError: false
        } : null,
        extractionDetails
      };

      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      const message = error?.message || String(error);
      console.error('❌ Comparison failed:', message);

      const isTimeout =
        /timeout/i.test(message) ||
        /timed out/i.test(message) ||
        /deadline reached/i.test(message) ||
        /aborted/i.test(message);

      if (isTimeout) {
        return res.status(504).json({
          success: false,
          error: `Comparison failed: ${message}`,
          details: 'The backend timed out while extracting the web page. Try again with a simpler URL, enable authentication, or reduce the extraction scope.'
        });
      }

      res.status(500).json({
        success: false,
        error: `Comparison failed: ${message}`
      });
    }
  });

  /**
   * Screenshot Comparison Endpoints
   */

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Generate uploadId once per request (first file triggers this)
      if (!req.uploadId) {
        req.uploadId = uuidv4();
      }
      const uploadDir = path.join(process.cwd(), 'output/screenshots/uploads', req.uploadId);
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const prefix = file.fieldname === 'figmaScreenshot' ? 'figma' : 'developed';
      cb(null, `${prefix}-original${ext}`);
    }
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit (increased for high-res screenshots)
      files: 2,
      fieldSize: 50 * 1024 * 1024 // Increase field size limit
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
      }
    }
  });

  // Screenshot upload endpoint (NO rate limiting - internal file processing)
  app.post('/api/screenshots/upload',
    (req, res, next) => {
      // Removed: console.log('🔵 Screenshot upload request started');
      // Removed: console.log('  Headers:', req.headers);
      // Removed: console.log('  Content-Length:', req.headers['content-length']);
      // Removed: console.log('  Content-Type:', req.headers['content-type']);

      // Increase timeout for large file uploads
      req.setTimeout(5 * 60 * 1000); // 5 minutes
      res.setTimeout(5 * 60 * 1000);

      upload.fields([
        { name: 'figmaScreenshot', maxCount: 1 },
        { name: 'developedScreenshot', maxCount: 1 }
      ])(req, res, (err) => {
        if (err) {
          console.error('❌ Multer error:', err);
          console.error('  Error code:', err.code);
          console.error('  Error message:', err.message);
          console.error('  Stack:', err.stack);

          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
              success: false,
              error: 'File too large. Maximum file size is 50MB per screenshot.'
            });
          }
          return res.status(400).json({
            success: false,
            error: 'File upload error: ' + err.message
          });
        }
        console.log('✅ Multer processing complete, files uploaded');
        next();
      });
    },
    async (req, res) => {
      try {
        console.log('📦 Processing uploaded files...');
        // console.log('Upload request received:', {
        //   hasFiles: !!req.files,
        //   fileFields: req.files ? Object.keys(req.files) : [],
        //   body: req.body,
        //   headers: {
        //     'content-type': req.headers['content-type'],
        //     'content-length': req.headers['content-length']
        //   }
        // });

        const files = req.files;

        if (!files || !files.figmaScreenshot || !files.developedScreenshot) {
          // console.log('Missing files:', {
          //   files: !!files,
          //   figmaScreenshot: files ? !!files.figmaScreenshot : false,
          //   developedScreenshot: files ? !!files.developedScreenshot : false
          // });
          return res.status(400).json({
            success: false,
            error: 'Both Figma and developed screenshots are required'
          });
        }

        // Get upload ID from multer storage (already generated in destination callback)
        const uploadId = req.uploadId;

        // Store upload metadata
        const metadata = {
          uploadId,
          figmaPath: files.figmaScreenshot[0].path,
          developedPath: files.developedScreenshot[0].path,
          figmaOriginalName: files.figmaScreenshot[0].originalname,
          developedOriginalName: files.developedScreenshot[0].originalname,
          uploadedAt: new Date().toISOString(),
          metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {}
        };

        const uploadDir = path.dirname(files.figmaScreenshot[0].path);
        await fs.promises.writeFile(
          path.join(uploadDir, 'metadata.json'),
          JSON.stringify(metadata, null, 2)
        );

        res.json({
          success: true,
          data: { uploadId },
          message: 'Screenshots uploaded successfully'
        });

      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
          success: false,
          error: 'Upload failed: ' + error.message
        });
      }
    }
  );

  // Start screenshot comparison endpoint
  app.post('/api/screenshots/compare', async (req, res) => {
    try {
      const { uploadId, settings } = req.body;

      if (!uploadId) {
        return res.status(400).json({
          success: false,
          error: 'Upload ID is required'
        });
      }

      if (!screenshotComparisonService) {
        return res.status(503).json({
          success: false,
          error: 'Screenshot comparison service not available'
        });
      }

      // Default settings
      const comparisonSettings = {
        threshold: 0.1,
        colorTolerance: 30,
        ignoreAntiAliasing: false,
        includeTextAnalysis: true,
        layoutAnalysis: true,
        colorAnalysis: true,
        spacingAnalysis: true,
        ...settings
      };

      // Removed: console.log(`📸 Starting screenshot comparison for upload: ${uploadId}`);

      const result = await screenshotComparisonService.compareScreenshots(uploadId, comparisonSettings);

      // Save screenshot result to database if services available
      if (dbServices && result.id) {
        try {
          await dbServices.screenshots.createScreenshotResult({
            userId: req.user?.id || null,
            uploadId,
            comparisonId: result.id,
            status: result.status || 'completed',
            figmaScreenshotPath: result.figmaScreenshotPath,
            developedScreenshotPath: result.developedScreenshotPath,
            diffImagePath: result.diffImagePath,
            sideBySidePath: result.sideBySidePath,
            metrics: result.metrics,
            discrepancies: result.discrepancies,
            enhancedAnalysis: result.enhancedAnalysis,
            colorPalettes: result.colorPalettes,
            reportPath: result.reportPath,
            settings: comparisonSettings,
            processingTime: result.processingTime
          });
          // Removed: console.log(`✅ Screenshot result saved to database: ${result.id}`);
        } catch (dbError) {
          console.warn('⚠️ Failed to save screenshot result to database:', dbError.message);
        }
      }

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Screenshot comparison error:', error);
      res.status(500).json({
        success: false,
        error: 'Screenshot comparison failed: ' + error.message
      });
    }
  });

  // Serve screenshot comparison images
  app.get('/api/screenshots/images/:comparisonId/:imageType', async (req, res) => {
    try {
      const { comparisonId, imageType } = req.params;

      // Validate image type
      const allowedTypes = ['pixel-diff', 'side-by-side', 'figma-processed', 'developed-processed'];
      if (!allowedTypes.includes(imageType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid image type'
        });
      }

      const comparisonDir = path.join(process.cwd(), 'output/screenshots/comparisons', comparisonId);
      let imagePath;

      switch (imageType) {
        case 'pixel-diff':
          imagePath = path.join(comparisonDir, 'pixel-diff.png');
          break;
        case 'side-by-side':
          imagePath = path.join(comparisonDir, 'side-by-side.png');
          break;
        case 'figma-processed':
          imagePath = path.join(comparisonDir, 'figma-processed.png');
          break;
        case 'developed-processed':
          imagePath = path.join(comparisonDir, 'developed-processed.png');
          break;
      }

      // Check if image exists
      if (!fs.existsSync(imagePath)) {
        return res.status(404).json({
          success: false,
          error: 'Image not found'
        });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      // Stream the image file
      const imageStream = fs.createReadStream(imagePath);
      imageStream.pipe(res);

    } catch (error) {
      console.error('Error serving image:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to serve image'
      });
    }
  });

  // Serve screenshot comparison detailed reports
  app.get('/api/screenshots/reports/:comparisonId', async (req, res) => {
    try {
      const { comparisonId } = req.params;

      const comparisonDir = path.join(process.cwd(), 'output/screenshots/comparisons', comparisonId);
      const reportPath = path.join(comparisonDir, 'detailed-report.html');

      // Check if report exists
      if (!fs.existsSync(reportPath)) {
        return res.status(404).json({
          success: false,
          error: 'Report not found'
        });
      }

      // Set appropriate headers for HTML
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      // Stream the HTML file
      const reportStream = fs.createReadStream(reportPath);
      reportStream.pipe(res);

    } catch (error) {
      console.error('Error serving report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to serve report'
      });
    }
  });


  // Get screenshot comparison status/result endpoint
  app.get('/api/screenshots/compare/:comparisonId', async (req, res) => {
    try {
      const { comparisonId } = req.params;
      const resultPath = path.join(process.cwd(), 'output/screenshots/comparisons', comparisonId, 'result.json');

      if (!fs.existsSync(resultPath)) {
        return res.status(404).json({
          success: false,
          error: 'Comparison result not found'
        });
      }

      const result = JSON.parse(await fs.promises.readFile(resultPath, 'utf8'));

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Get comparison result error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve comparison result: ' + error.message
      });
    }
  });

  // List screenshot comparisons endpoint
  app.get('/api/screenshots/list', async (req, res) => {
    try {
      const comparisonsDir = path.join(process.cwd(), 'output/screenshots/comparisons');

      if (!fs.existsSync(comparisonsDir)) {
        return res.json({
          success: true,
          data: []
        });
      }

      const dirs = await fs.promises.readdir(comparisonsDir);
      const comparisons = [];

      for (const dir of dirs) {
        const resultPath = path.join(comparisonsDir, dir, 'result.json');
        if (fs.existsSync(resultPath)) {
          try {
            const result = JSON.parse(await fs.promises.readFile(resultPath, 'utf8'));
            comparisons.push({
              id: result.id,
              status: result.status,
              createdAt: result.createdAt,
              metrics: result.metrics ? {
                overallSimilarity: result.metrics.overallSimilarity,
                totalDiscrepancies: result.metrics.totalDiscrepancies,
                qualityScore: result.metrics.qualityScore
              } : null
            });
          } catch (parseError) {
            console.warn(`Failed to parse result for ${dir}:`, parseError.message);
          }
        }
      }

      // Sort by creation date (newest first)
      comparisons.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({
        success: true,
        data: comparisons
      });

    } catch (error) {
      console.error('List comparisons error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list comparisons: ' + error.message
      });
    }
  });

  /**
   * Enhanced web extraction endpoint (V2 - Legacy)
   * @deprecated Use /api/web/extract-v3 instead
   * Note: No rate limiting - this is internal web scraping, not external API calls
   */
  app.post('/api/web/extract-v2',
    validateExtractionUrl(config.security.allowedHosts),
    async (req, res, next) => {
      console.warn('⚠️ DEPRECATED: /api/web/extract-v2 will be removed. Use /api/web/extract-v3');
      res.setHeader('X-Deprecated-Endpoint', 'true');

      try {
        const { url, authentication, options = {} } = req.body;

        // Extract using improved extractor
        const webData = await webExtractorV2.extractWebData(url, {
          authentication,
          timeout: config.timeouts.webExtraction,
          includeScreenshot: options.includeScreenshot !== false,
          viewport: options.viewport,
          ...options
        });

        res.json(webData);
      } catch (error) {
        next(error);
      }
    });

  /**
   * Enable file logging endpoint (Development/Debugging)
   * Temporary feature for debugging web extraction issues
   */
  app.post('/api/logging/enable', (req, res) => {
    try {
      logger.enableFileLogging();
      res.json({
        success: true,
        message: 'File logging enabled',
        logDir: logger.getLogDir()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Unified web extraction endpoint (V3 - Recommended)
   * Note: No rate limiting - this is internal web scraping, not external API calls
   */
  app.post('/api/web/extract-v3',
    validateExtractionUrl(config.security.allowedHosts),
    async (req, res, next) => {
      try {
        const { url, authentication, designSystemId, options = {} } = req.body;
        const startTime = Date.now();

        // Removed: console.log(`🚀 Starting unified extraction for: ${url}`);

        const { options: resolvedOptions, profile } = await resolveExtractionOptions(url, {
          authentication,
          designSystemId,
          timeout: options.timeout || config.timeouts.webExtraction,
          includeScreenshot: options.includeScreenshot !== false,
          viewport: options.viewport || { width: 1920, height: 1080 },
          stabilityTimeout: options.stabilityTimeout || 5000,
          ...options
        });

        const webData = await unifiedWebExtractor.extractWebData(url, resolvedOptions);
        attachSiteProfileMetadata(webData, profile);

        const duration = Date.now() - startTime;
        // Removed: console.log(`✅ Unified extraction completed in ${duration}ms`);

        // Track performance
        if (performanceMonitor) {
          performanceMonitor.trackExtraction('unified-web', duration, {
            url,
            elementsExtracted: webData.elements?.length || 0,
            hasScreenshot: !!webData.screenshot
          });
        }

        // Return both a standardized API envelope and the legacy/raw shape (for compatibility).
        res.json({
          success: true,
          data: {
            ...webData,
            extractor: 'unified-v3',
            performance: { duration }
          },
          // Legacy/raw fields (kept so older clients can read top-level keys)
          ...webData,
          extractor: 'unified-v3',
          performance: { duration }
        });
      } catch (error) {
        console.error(`❌ Unified extraction failed: ${error.message}`);
        next(error);
      }
    });

  /**
   * Browser pool statistics endpoint
   */
  app.get('/api/browser/stats', (req, res) => {
    const stats = browserPool.getStats();
    const resourceStats = resourceManager.getStats();

    res.json({
      browserPool: stats,
      resourceManager: resourceStats,
      activeExtractions: {
        v2: webExtractorV2.getActiveExtractions(),
        v3: unifiedWebExtractor.getActiveExtractions()
      },
      platform: {
        os: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      }
    });
  });

  /**
   * Cancel extraction endpoint
   */
  app.post('/api/extractions/:id/cancel', async (req, res, next) => {
    try {
      const { id } = req.params;
      await webExtractorV2.cancelExtraction(id);
      res.json({ message: 'Extraction cancelled' });
    } catch (error) {
      next(error);
    }
  });

  // Export routes must be registered before static exports handler
  try {
    const exportRoutes = await import('../../routes/exportRoutes.js');
    app.use('/api/export', exportRoutes.default);
    console.log('✅ Export routes registered');
  } catch (error) {
    console.warn('⚠️ Failed to load export routes:', error.message);
  }

  // Serve exported bundles
  app.use('/exports', express.static(path.join(process.cwd(), 'output', 'exports')));

  /**
   * Catch-all route - serve frontend (exclude report files and API routes)
   */
  app.get('*', (req, res, next) => {
    // Removed: console.log(`[Catch-all] Request path: ${req.path}`);

    // Don't serve frontend for API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }

    // Don't serve frontend for report files - let static middleware handle them
    if (req.path.startsWith('/reports/') && req.path.endsWith('.html')) {
      return next();
    }

    // Serve index.html for all other routes (SPA routing)
    const indexPath = path.resolve(frontendPath, 'index.html');
    // Removed: console.log(`[Catch-all] Checking indexPath: ${indexPath}`);
    // Removed: console.log(`[Catch-all] indexPath exists: ${fs.existsSync(indexPath)}`);

    if (fs.existsSync(indexPath)) {
      // Removed: console.log(`[Catch-all] Sending index.html`);
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`[Catch-all] Error sending file:`, err);
          res.status(500).send('Error serving frontend');
        }
      });
    } else {
      console.error(`❌ index.html not found at: ${indexPath}`);
      console.error(`   Frontend path: ${frontendPath}`);
      console.error(`   Current working directory: ${process.cwd()}`);
      res.status(500).send('Frontend not found. Please rebuild the frontend.');
    }
  });

  // 404 handler for API routes
  app.use('/api', notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  // Enhanced graceful shutdown handling
  async function gracefulShutdown(signal) {
    // Removed: console.log(`Received ${signal}, initiating graceful shutdown...`);

    try {
      // Shutdown enhanced services first
      if (serviceManager) {
        // Removed: console.log('Shutting down enhanced service manager...');
        await serviceManager.shutdown();
      }

      // Cancel all active extractions
      // Removed: console.log('Cancelling active extractions...');
      await webExtractorV2.cancelAllExtractions();
      await unifiedWebExtractor.cancelAllExtractions();

      // Shutdown resource manager
      // Removed: console.log('Shutting down resource manager...');
      await shutdownResourceManager();

      // Shutdown browser pool
      // Removed: console.log('Shutting down browser pool...');
      await shutdownBrowserPool();

      // Close server
      // Removed: console.log('Closing HTTP server...');
      server.close(() => {
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        console.log('⚠️ Force exit after timeout');
        process.exit(1);
      }, 30000);

    } catch (error) {
      console.error('❌ Error during shutdown:', error.message);
      process.exit(1);
    }
  }

  // Add global error handlers for debugging
  process.on('uncaughtException', (error) => {
    console.error('💥 UNCAUGHT EXCEPTION:', error);
    console.error('  Message:', error.message);
    console.error('  Stack:', error.stack);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION:', reason);
    console.error('  Promise:', promise);
  });

  // Start server
  const PORT = portArg || config.server?.port || parseInt(process.env.PORT || '3847', 10);
  const HOST = config.server?.host || process.env.HOST || '0.0.0.0';

  // Wrap server.listen in a Promise to ensure it's actually listening before returning
  return new Promise((resolve, reject) => {
    // Handle server errors
    httpServer.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        reject(new Error(`Port ${PORT} is already in use`));
      } else {
        console.error('❌ Server error:', error.message);
        reject(error);
      }
    });

    const server = httpServer.listen(PORT, HOST, () => {
      process.stdout.write(`Server running on port ${PORT}\n`);

      // Removed: console.log(`🚀 Server running at http://${HOST}:${PORT}`);
      // Removed: console.log(`📱 Frontend available at http://${HOST}:${PORT}`);
      // Removed: console.log(`🔌 MCP Status: ${mcpConnected ? 'Connected' : 'Disconnected'}`);
      // Removed: console.log(`🔌 WebSocket server ready for connections`);
      // Removed: console.log(`🔧 Enhanced features: Browser Pool, Security, Rate Limiting`);

      // Don't try to connect MCP here - it's already attempted above

      // Start periodic MCP status checks
      setInterval(async () => {
        // Don't check if we are in API-only mode
        if (config.mcp?.mode === 'api') {
          return;
        }

        try {
          const wasConnected = mcpConnected;
          if (figmaClient) {
            // If we recently had auth errors, maybe skip or backoff?
            // For now, just try to connect
            mcpConnected = await figmaClient.connect();

            if (wasConnected !== mcpConnected) {
              // Removed: console.log(`🔌 MCP Status changed: ${mcpConnected ? 'Connected' : 'Disconnected'}`);
            }
          } else {
            try {
              // Try to re-initialize client if it was missing
              // Only try Desktop MCP in local mode
              const { getMCPClient } = await import('../../config/mcp-config.js');
              if (isLocalMode) {
                figmaClient = await getMCPClient({ mode: figmaConnectionMode, autoDetectDesktop: true });
              } else {
                figmaClient = await getMCPClient({ mode: 'figma', autoDetectDesktop: false });
              }
            } catch (e) {
              console.warn('[MCP] Status check: Failed to re-initialize client:', e.message);
              mcpConnected = null;
            }
          }
        } catch (error) {
          if (mcpConnected) {
            mcpConnected = false;
            // Removed: console.log('🔌 MCP Status changed: Disconnected');
          }

          // Log error only if it's NOT a 401 to avoid spamming logs when config is wrong
          // 401 means "Invalid Token", which won't fix itself by retrying
          if (!error.message.includes('401') && !error.message.includes('Unauthorized')) {
            console.warn('MCP Status Check Failed:', error.message);
          }
        }
      }, 30000); // Check every 30 seconds

      // Setup signal handlers
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
      process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

      // Server is now listening, resolve the promise
      resolve(server);
    });
  });
} 
