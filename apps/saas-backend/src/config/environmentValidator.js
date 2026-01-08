/**
 * Environment Variable Validation Module
 * Validates required environment variables on server startup
 * Provides clear error messages and fallback strategies
 */

import { logger } from '../utils/logger.js';

export class EnvironmentValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.config = {};
  }

  /**
   * Validate all required environment variables
   */
  validate() {
    this.validateNodeEnvironment();
    this.validateServerConfiguration();
    this.validateDatabaseConfiguration();
    this.validateAuthenticationConfiguration();
    this.validateExternalServiceConfiguration();
    this.validateOptionalConfiguration();

    if (this.errors.length > 0) {
      this.logValidationResults();
      throw new Error(`Environment validation failed: ${this.errors.length} critical errors found`);
    }

    if (this.warnings.length > 0) {
      this.logValidationResults();
    }

    return this.config;
  }

  validateNodeEnvironment() {
    // Node environment
    this.config.nodeEnv = process.env.NODE_ENV || 'development';
    if (!['development', 'test', 'staging', 'production'].includes(this.config.nodeEnv)) {
      this.addWarning('NODE_ENV', `Unknown environment "${this.config.nodeEnv}", using development defaults`);
      this.config.nodeEnv = 'development';
    }

    // Debug mode
    this.config.debug = process.env.DEBUG === 'true' || this.config.nodeEnv === 'development';
  }

  validateServerConfiguration() {
    // Port configuration
    const port = process.env.PORT || process.env.SERVER_PORT || '3847';
    this.config.port = parseInt(port, 10);

    if (isNaN(this.config.port) || this.config.port < 1 || this.config.port > 65535) {
      this.addError('PORT', `Invalid port number: ${port}`);
    }

    // Host configuration
    this.config.host = process.env.HOST || '0.0.0.0';

    // Detect deployment environment
    this.config.isProduction = this.config.nodeEnv === 'production';
    this.config.isCloud = !!(process.env.RENDER || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.HEROKU);
    this.config.isLocal = !this.config.isCloud;
  }

  validateDatabaseConfiguration() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const forceLocal = process.env.DB_MODE === 'local' || process.env.FORCE_LOCAL_MODE === 'true';

    this.config.database = {
      mode: forceLocal ? 'local' : (supabaseUrl ? 'supabase' : 'local'),
      supabaseUrl,
      supabaseKey,
      supabaseServiceKey,
      forceLocal
    };

    if (!forceLocal && this.config.isProduction) {
      if (!supabaseUrl) {
        this.addError('SUPABASE_URL', 'Required for production database connection');
      } else if (!this.isValidUrl(supabaseUrl)) {
        this.addError('SUPABASE_URL', 'Must be a valid URL');
      }

      if (!supabaseKey) {
        this.addError('SUPABASE_ANON_KEY', 'Required for production database connection');
      }

      if (!supabaseServiceKey) {
        this.addWarning('SUPABASE_SERVICE_KEY', 'Recommended for admin operations');
      }
    } else if (!forceLocal && !supabaseUrl) {
      this.addWarning('SUPABASE_URL', 'Using local database adapter as fallback');
    }
  }

  validateAuthenticationConfiguration() {
    const credentialKey = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.LOCAL_CREDENTIAL_KEY;
    const jwtSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

    this.config.auth = {
      credentialEncryptionKey: credentialKey,
      jwtSecret
    };

    // Credential encryption key is critical for storing OAuth tokens
    if (!credentialKey) {
      if (this.config.isProduction) {
        this.addError('CREDENTIAL_ENCRYPTION_KEY', 'Required for secure credential storage in production');
      } else {
        this.addWarning('CREDENTIAL_ENCRYPTION_KEY', 'OAuth credentials cannot be stored without encryption key');
      }
    } else if (credentialKey.length < 32) {
      this.addError('CREDENTIAL_ENCRYPTION_KEY', 'Must be at least 32 characters for security');
    }

    // JWT secret for authentication
    if (!jwtSecret && this.config.isProduction) {
      this.addWarning('JWT_SECRET', 'Consider setting for enhanced security');
    }

    // OAuth configuration
    this.validateOAuthConfiguration();
  }

  validateOAuthConfiguration() {
    const figmaClientId = process.env.FIGMA_CLIENT_ID;
    const figmaClientSecret = process.env.FIGMA_CLIENT_SECRET;
    const figmaRedirectUri = process.env.FIGMA_REDIRECT_URI;

    this.config.figmaOAuth = {
      clientId: figmaClientId,
      clientSecret: figmaClientSecret,
      redirectUri: figmaRedirectUri
    };

    if (figmaClientId && !figmaClientSecret) {
      this.addWarning('FIGMA_CLIENT_SECRET', 'Required when FIGMA_CLIENT_ID is set');
    }

    if (figmaRedirectUri && !this.isValidUrl(figmaRedirectUri)) {
      this.addWarning('FIGMA_REDIRECT_URI', 'Must be a valid URL');
    }
  }

  validateExternalServiceConfiguration() {
    // MCP Configuration
    const mcpUrl = process.env.MCP_URL;
    const figmaMcpPort = process.env.FIGMA_MCP_PORT;
    const figmaConnectionMode = process.env.FIGMA_CONNECTION_MODE;

    this.config.mcp = {
      url: mcpUrl || 'https://mcp.figma.com/mcp',
      figmaPort: figmaMcpPort ? parseInt(figmaMcpPort, 10) : 3845,
      connectionMode: figmaConnectionMode || 'auto'
    };

    if (mcpUrl && !this.isValidUrl(mcpUrl)) {
      this.addWarning('MCP_URL', 'Must be a valid URL');
    }

    if (figmaMcpPort && (isNaN(this.config.mcp.figmaPort) || this.config.mcp.figmaPort < 1)) {
      this.addWarning('FIGMA_MCP_PORT', 'Must be a valid port number');
      this.config.mcp.figmaPort = 3845;
    }

    // API Keys
    const figmaApiKey = process.env.FIGMA_API_KEY;
    this.config.figmaApiKey = figmaApiKey;

    if (!figmaApiKey) {
      this.addWarning('FIGMA_API_KEY', 'Required for Figma API access when OAuth is not available');
    }
  }

  validateOptionalConfiguration() {
    // CORS configuration
    this.config.cors = {
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || []
    };

    // Rate limiting
    this.config.rateLimit = {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      extractionMax: parseInt(process.env.RATE_LIMIT_EXTRACTION_MAX || '10', 10)
    };

    // Logging
    this.config.logging = {
      level: process.env.LOG_LEVEL || (this.config.nodeEnv === 'production' ? 'info' : 'debug'),
      enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false'
    };

    // Features flags
    this.config.features = {
      enableScreenshotComparison: process.env.ENABLE_SCREENSHOT_COMPARISON !== 'false',
      enableDesignSystemValidation: process.env.ENABLE_DESIGN_SYSTEM_VALIDATION !== 'false',
      enableMetrics: process.env.ENABLE_METRICS !== 'false'
    };
  }

  addError(variable, message) {
    this.errors.push({ variable, message, severity: 'error' });
  }

  addWarning(variable, message) {
    this.warnings.push({ variable, message, severity: 'warning' });
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  logValidationResults() {
    if (this.errors.length > 0) {
      logger.error('❌ Environment validation errors:');
      this.errors.forEach(({ variable, message }) => {
        logger.error(`  ${variable}: ${message}`);
      });

      logger.error('\nTo fix these errors:');
      this.errors.forEach(({ variable, message }) => {
        if (variable === 'CREDENTIAL_ENCRYPTION_KEY') {
          logger.error(`  export ${variable}=$(openssl rand -base64 32)`);
        } else {
          logger.error(`  export ${variable}=<value>`);
        }
      });
    }

    if (this.warnings.length > 0) {
      logger.warn('⚠️  Environment validation warnings:');
      this.warnings.forEach(({ variable, message }) => {
        logger.warn(`  ${variable}: ${message}`);
      });
    }

    // Log configuration summary
    logger.info('📋 Configuration summary:', {
      environment: this.config.nodeEnv,
      port: this.config.port,
      database: this.config.database.mode,
      isProduction: this.config.isProduction,
      isCloud: this.config.isCloud
    });
  }

  /**
   * Generate environment variable template
   */
  generateTemplate() {
    const template = `
# DesignQA Environment Configuration Template

# === Server Configuration ===
NODE_ENV=development
PORT=3847
HOST=0.0.0.0

# === Database Configuration ===
# For production, use Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# For local development, force local mode
# DB_MODE=local
# FORCE_LOCAL_MODE=true

# === Authentication ===
# CRITICAL: Generate with: openssl rand -base64 32
CREDENTIAL_ENCRYPTION_KEY=your-32-character-encryption-key

# OAuth Configuration (optional)
FIGMA_CLIENT_ID=your-figma-client-id
FIGMA_CLIENT_SECRET=your-figma-client-secret
FIGMA_REDIRECT_URI=https://your-domain.com/auth/figma/callback

# === External Services ===
# Figma API Key (fallback when OAuth not available)
FIGMA_API_KEY=your-figma-api-key

# MCP Configuration
MCP_URL=https://mcp.figma.com/mcp
FIGMA_MCP_PORT=3845
FIGMA_CONNECTION_MODE=auto

# === Security & Performance ===
# CORS (comma-separated origins)
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend-domain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
RATE_LIMIT_EXTRACTION_MAX=10

# === Logging & Debugging ===
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
DEBUG=false

# === Feature Flags ===
ENABLE_SCREENSHOT_COMPARISON=true
ENABLE_DESIGN_SYSTEM_VALIDATION=true
ENABLE_METRICS=true
`;

    return template.trim();
  }
}

// Export singleton instance
export const environmentValidator = new EnvironmentValidator();

// Export validation function for immediate use
export function validateEnvironment() {
  return environmentValidator.validate();
}

// Export helper to generate template
export function generateEnvironmentTemplate() {
  return environmentValidator.generateTemplate();
}