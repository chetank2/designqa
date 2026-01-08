/**
 * Professional Logging System
 * Provides structured logging with different levels and environments
 * Following devops-automator agent methodology
 */

import fs from 'fs';
import path from 'path';

/**
 * Redact sensitive tokens from strings
 * Replaces Figma tokens (figd_ prefix) and long base64 strings with ***REDACTED***
 * @param {string} text - Text that may contain tokens
 * @returns {string} Text with tokens redacted
 */
export function redactToken(text) {
  if (typeof text !== 'string') {
    return text;
  }

  // Redact Figma PAT tokens (figd_ prefix)
  text = text.replace(/figd_[a-zA-Z0-9_-]{20,}/g, '***REDACTED_TOKEN***');

  // Redact long base64 strings (likely encrypted tokens/secrets)
  // Match base64 strings longer than 32 characters
  text = text.replace(/[A-Za-z0-9+/]{32,}={0,2}/g, (match) => {
    // Only redact if it looks like a token (long enough and base64-like)
    if (match.length > 32) {
      return '***REDACTED_TOKEN***';
    }
    return match;
  });

  // Redact Bearer tokens in Authorization headers
  text = text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***REDACTED_TOKEN***');

  // Redact client secrets (common patterns)
  text = text.replace(/client[_-]?secret["\s:=]+([A-Za-z0-9._-]+)/gi, 'client_secret="***REDACTED***"');

  return text;
}

/**
 * Redact tokens from objects recursively
 * @param {any} obj - Object that may contain tokens
 * @returns {any} Object with tokens redacted
 */
export function redactTokensFromObject(obj) {
  if (typeof obj === 'string') {
    return redactToken(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactTokensFromObject(item));
  }

  if (obj && typeof obj === 'object') {
    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip redaction for certain safe keys
      if (['id', 'userId', 'user_id', 'timestamp', 'created_at', 'updated_at'].includes(key.toLowerCase())) {
        redacted[key] = value;
      } else {
        redacted[key] = redactTokensFromObject(value);
      }
    }
    return redacted;
  }

  return obj;
}

class Logger {
  constructor() {
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };

    this.currentLevel = process.env.NODE_ENV === 'production' 
      ? this.levels.INFO 
      : this.levels.DEBUG;

    this.colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow  
      INFO: '\x1b[36m',  // Cyan
      DEBUG: '\x1b[37m', // White
      RESET: '\x1b[0m'
    };

    this.emojis = {
      ERROR: '❌',
      WARN: '⚠️',
      INFO: 'ℹ️',
      DEBUG: '🔍'
    };

    // Ensure logs directory exists
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDir();
    
    // Runtime file logging flag (can be enabled via API)
    this.fileLoggingEnabled = false;
  }

  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      // Fallback - don't fail if we can't create logs directory
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const emoji = this.emojis[level];
    const color = this.colors[level];
    const reset = this.colors.RESET;

    // Redact tokens from message and meta
    const redactedMessage = redactToken(message);
    const redactedMeta = redactTokensFromObject(meta);

    // Console format (with colors and emojis)
    const consoleMessage = `${color}${emoji} [${timestamp}] ${level}:${reset} ${redactedMessage}`;
    
    // File format (no colors/emojis, structured)
    const fileMessage = JSON.stringify({
      timestamp,
      level,
      message: redactedMessage,
      ...redactedMeta
    });

    return { consoleMessage, fileMessage };
  }

  shouldLog(level) {
    return this.levels[level] <= this.currentLevel;
  }

  writeToFile(message, level) {
    try {
      const date = new Date().toISOString().split('T')[0];
      const filename = path.join(this.logDir, `app-${date}.log`);
      
      // Append to daily log file
      fs.appendFileSync(filename, message + '\n');
      
      // Also write errors to separate error log
      if (level === 'ERROR') {
        const errorFilename = path.join(this.logDir, `error-${date}.log`);
        fs.appendFileSync(errorFilename, message + '\n');
      }
    } catch (error) {
      // Fallback - don't fail the application if logging fails
    }
  }

  /**
   * Enable file logging at runtime
   */
  enableFileLogging() {
    this.fileLoggingEnabled = true;
    this.ensureLogDir();
    // Removed: console.log(`📝 File logging enabled - logs will be written to: ${this.logDir}`);
  }

  /**
   * Get log directory path
   */
  getLogDir() {
    return this.logDir;
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const { consoleMessage, fileMessage } = this.formatMessage(level, message, meta);
    
    // Output to console with immediate flush for terminal visibility
    // Removed: console.log(consoleMessage);
    // Ensure immediate flush to terminal (especially important for real-time comparison logs)
    if (process.stdout.isTTY && typeof process.stdout.flush === 'function') {
      try {
        process.stdout.flush();
      } catch (e) {
        // Ignore flush errors (not available in all environments)
      }
    }
    
    // Write to file if enabled (runtime flag or env var or production)
    if (this.fileLoggingEnabled || process.env.NODE_ENV === 'production' || process.env.LOG_TO_FILE === 'true') {
      this.writeToFile(fileMessage, level);
    }
  }

  error(message, meta = {}) {
    this.log('ERROR', message, meta);
  }

  warn(message, meta = {}) {
    this.log('WARN', message, meta);
  }

  info(message, meta = {}) {
    this.log('INFO', message, meta);
  }

  debug(message, meta = {}) {
    this.log('DEBUG', message, meta);
  }

  // Structured logging for specific use cases
  httpRequest(req, res, duration) {
    this.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent')
    });
  }

  comparison(result) {
    this.info('Comparison Completed', {
      figmaComponents: result.metadata?.figmaComponentCount || 0,
      webElements: result.metadata?.webElementCount || 0,
      colorMatches: result.colors?.matches?.length || 0,
      typographyMatches: result.typography?.matches?.length || 0,
      overallScore: result.summary?.overallScore || 0
    });
  }

  extraction(type, url, result) {
    this.info(`${type} Extraction`, {
      url,
      success: !!result,
      componentCount: result?.components?.length || 0,
      colorCount: result?.colors?.length || 0,
      typographyCount: result?.typography?.length || 0
    });
  }

  performance(operation, duration, metadata = {}) {
    const level = duration > 5000 ? 'WARN' : 'INFO';
    this.log(level, `Performance: ${operation}`, {
      duration: `${duration}ms`,
      slow: duration > 5000,
      ...metadata
    });
  }
}

// Export singleton instance
export const logger = new Logger();
export default logger; 