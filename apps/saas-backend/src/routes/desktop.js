/**
 * Desktop App API Routes
 * Handles desktop app registration and capabilities
 */

import { v4 as uuidv4 } from 'uuid';

// Use dynamic import for jsonwebtoken to handle missing dependency gracefully
let jwt = null;
let jwtLoading = false;

async function loadJWT() {
  if (jwtLoading) {
    return jwt;
  }
  jwtLoading = true;
  try {
    const jwtModule = await import('jsonwebtoken');
    jwt = jwtModule.default || jwtModule;
  } catch (error) {
    console.warn('⚠️ jsonwebtoken not available, using simple token generation');
  }
  return jwt;
}

// Preload JWT module
loadJWT();

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'desktop-jwt-secret-change-in-production';
const JWT_EXPIRY = '15m'; // 15 minutes

// Simple in-memory user preferences store for desktop/local mode
const userPreferencesStore = new Map();

// Helper function to get jwt (may need to wait for load)
async function getJWT() {
  if (!jwt && !jwtLoading) {
    await loadJWT();
  }
  return jwt;
}

/**
 * Desktop registration endpoint
 * POST /api/desktop/register
 */
export async function registerDesktop(req, res) {
  try {
    const { userId, desktopId, mcpPort, mcpAvailable } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Generate or use provided desktop ID
    const finalDesktopId = desktopId || uuidv4();

    // Get database services
    const { getServices } = await import('../database/init.js');
    const services = getServices();

    if (!services) {
      return res.status(500).json({
        success: false,
        error: 'Database services not available'
      });
    }

    // Store desktop agent info (if database supports it)
    // For now, we'll just generate JWT and return it
    // In production, store in desktop_agents table

    // Generate JWT for desktop ↔ SaaS auth
    let token;
    const jwtModule = await getJWT();
    if (jwtModule) {
      token = jwtModule.sign(
        {
          desktopId: finalDesktopId,
          userId: userId,
          mcpPort: mcpPort || null,
          mcpAvailable: mcpAvailable || false,
          type: 'desktop'
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );
    } else {
      // Fallback: simple base64 token
      const payload = {
        desktopId: finalDesktopId,
        userId: userId,
        mcpPort: mcpPort || null,
        mcpAvailable: mcpAvailable || false,
        type: 'desktop',
        exp: Math.floor(Date.now() / 1000) + 900 // 15 minutes
      };
      token = Buffer.from(JSON.stringify(payload)).toString('base64');
    }

    // Removed: console.log(`✅ Desktop registered: ${finalDesktopId} for user ${userId}`);

    res.json({
      success: true,
      desktopId: finalDesktopId,
      token: token,
      expiresIn: 900 // 15 minutes in seconds
    });
  } catch (error) {
    console.error('❌ Desktop registration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get desktop capabilities for a user
 * GET /api/desktop/capabilities/:userId
 */
export async function getDesktopCapabilities(req, res) {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Cloud/SaaS deployments do not have access to the user's local Figma Desktop app.
    // Treat true cloud only when not running in desktop mode or local development.
    const isDesktopLikeEnvironment =
      process.env.DEPLOYMENT_MODE === 'desktop' ||
      process.env.NODE_ENV === 'development';

    const hasSupabaseConfig =
      !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);

    const isCloudEnvironment = !isDesktopLikeEnvironment && hasSupabaseConfig;

    if (isCloudEnvironment) {
      return res.json({
        success: true,
        desktopMCPAvailable: false,
        message: 'Desktop MCP is only available when running the DesignQA Desktop app or local server.'
      });
    }

    // Local/desktop environment: attempt to detect Figma Desktop MCP directly
    try {
      const { discoverMCPPort, isFigmaRunning } = await import('@designqa/mcp-client/discovery');

      const figmaRunning = await isFigmaRunning();
      if (!figmaRunning) {
        return res.json({
          success: true,
          desktopMCPAvailable: false,
          message: 'Figma Desktop app is not running. Please start Figma to use Desktop MCP.'
        });
      }

      const discovery = await discoverMCPPort();
      if (!discovery.port) {
        return res.json({
          success: true,
          desktopMCPAvailable: false,
          message: 'Could not find Figma MCP port. Ensure Dev Mode and the Figma MCP server are enabled.'
        });
      }

      return res.json({
        success: true,
        desktopMCPAvailable: true,
        mcpPort: discovery.port,
        message: `Desktop MCP is available on port ${discovery.port}.`
      });
    } catch (error) {
      console.warn('⚠️ Desktop MCP capability detection failed:', error.message);
      return res.json({
        success: true,
        desktopMCPAvailable: false,
        message: 'Failed to detect Desktop MCP. Make sure the DesignQA Desktop app and Figma are installed locally.'
      });
    }
  } catch (error) {
    console.error('❌ Failed to get desktop capabilities:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Validate desktop JWT token
 * Middleware for protecting desktop-specific routes
 */
export async function validateDesktopToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    
    const jwtModule = await getJWT();
    if (jwtModule) {
      decoded = jwtModule.verify(token, JWT_SECRET);
    } else {
      // Fallback: decode base64
      try {
        decoded = JSON.parse(Buffer.from(token, 'base64').toString());
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
          throw new Error('Token expired');
        }
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      }
    }

    if (decoded.type !== 'desktop') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token type'
      });
    }

    req.desktop = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
}

/**
 * Get stored desktop-related user preferences
 */
export async function getUserPreferences(req, res) {
  try {
    const userId = req.user?.id || req.query.userId || req.params?.userId || 'local-user';
    const preferences = userPreferencesStore.get(userId) || {
      desktopMCPEnabled: false
    };

    return res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('❌ Failed to load user preferences:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Save desktop-related user preferences
 */
export async function saveUserPreferences(req, res) {
  try {
    const userId = req.user?.id || req.body?.userId || 'local-user';
    const currentPreferences = userPreferencesStore.get(userId) || {};
    const mergedPreferences = {
      ...currentPreferences,
      ...(req.body || {}),
      updatedAt: new Date().toISOString()
    };

    userPreferencesStore.set(userId, mergedPreferences);

    return res.json({
      success: true,
      data: mergedPreferences
    });
  } catch (error) {
    console.error('❌ Failed to save user preferences:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export default {
  registerDesktop,
  getDesktopCapabilities,
  validateDesktopToken,
  getUserPreferences,
  saveUserPreferences
};
