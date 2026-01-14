/**
 * Standardized Error Handling Utility
 * Provides consistent error formatting, logging, and response patterns
 */

import { logger } from './logger.js';
import { circuitBreakerRegistry } from '../core/resilience/CircuitBreaker.js';

export class StandardError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'StandardError';
    this.code = options.code || 'UNKNOWN_ERROR';
    this.statusCode = options.statusCode || 500;
    this.category = options.category || 'general';
    this.retryable = options.retryable !== false;
    this.details = options.details || {};
    this.timestamp = new Date().toISOString();
    this.userMessage = options.userMessage || this.getDefaultUserMessage();
  }

  getDefaultUserMessage() {
    const messages = {
      'connection': 'Connection issue - please try again in a moment',
      'authentication': 'Authentication failed - please check your credentials',
      'authorization': 'Access denied - insufficient permissions',
      'validation': 'Invalid input - please check your data',
      'rate_limit': 'Too many requests - please wait before trying again',
      'external_service': 'External service unavailable - please try again later',
      'database': 'Database error - please try again',
      'general': 'An unexpected error occurred - please try again'
    };

    return messages[this.category] || messages.general;
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        category: this.category,
        statusCode: this.statusCode,
        retryable: this.retryable,
        timestamp: this.timestamp,
        userMessage: this.userMessage,
        details: this.details
      }
    };
  }
}

export class ErrorHandler {
  constructor() {
    this.errorStats = {
      total: 0,
      byCategory: {},
      byCode: {},
      recent: []
    };
  }

  /**
   * Handle and standardize different types of errors
   */
  handle(error, context = {}) {
    // Convert to StandardError if it isn't already
    let standardError;

    if (error instanceof StandardError) {
      standardError = error;
    } else {
      standardError = this.convertToStandardError(error, context);
    }

    // Update statistics
    this.updateErrorStats(standardError);

    // Log the error
    this.logError(standardError, context);

    return standardError;
  }

  /**
   * Convert various error types to StandardError
   */
  convertToStandardError(error, context = {}) {
    const errorMessage = error?.message || 'Unknown error occurred';

    // Database errors
    if (this.isDatabaseError(error)) {
      return new StandardError(errorMessage, {
        code: 'DATABASE_ERROR',
        statusCode: 500,
        category: 'database',
        retryable: true,
        details: {
          originalError: error.name,
          context: context.operation || 'unknown'
        },
        userMessage: 'Database temporarily unavailable. Please try again.'
      });
    }

    // Connection/Network errors
    if (this.isConnectionError(error)) {
      return new StandardError(errorMessage, {
        code: 'CONNECTION_ERROR',
        statusCode: 503,
        category: 'connection',
        retryable: true,
        details: {
          originalError: error.name,
          context: context.service || 'unknown'
        }
      });
    }

    // Authentication errors
    if (this.isAuthError(error)) {
      return new StandardError(errorMessage, {
        code: 'AUTH_ERROR',
        statusCode: 401,
        category: 'authentication',
        retryable: false,
        details: {
          originalError: error.name
        }
      });
    }

    // Authorization errors
    if (this.isAuthorizationError(error)) {
      return new StandardError(errorMessage, {
        code: 'AUTHORIZATION_ERROR',
        statusCode: 403,
        category: 'authorization',
        retryable: false,
        details: {
          originalError: error.name
        }
      });
    }

    // Validation errors
    if (this.isValidationError(error)) {
      return new StandardError(errorMessage, {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        category: 'validation',
        retryable: false,
        details: {
          originalError: error.name,
          validationDetails: error.details || {}
        }
      });
    }

    // Rate limit errors
    if (this.isRateLimitError(error)) {
      return new StandardError(errorMessage, {
        code: 'RATE_LIMIT_ERROR',
        statusCode: 429,
        category: 'rate_limit',
        retryable: true,
        details: {
          originalError: error.name
        }
      });
    }

    // External service errors
    if (this.isExternalServiceError(error)) {
      return new StandardError(errorMessage, {
        code: 'EXTERNAL_SERVICE_ERROR',
        statusCode: 502,
        category: 'external_service',
        retryable: true,
        details: {
          originalError: error.name,
          service: context.service || 'unknown'
        }
      });
    }

    // Circuit breaker errors
    if (error.circuitBreakerOpen) {
      return new StandardError(errorMessage, {
        code: 'CIRCUIT_BREAKER_OPEN',
        statusCode: 503,
        category: 'external_service',
        retryable: true,
        details: {
          circuitBreaker: true,
          service: context.service || 'unknown'
        }
      });
    }

    // Timeout errors
    if (this.isTimeoutError(error)) {
      return new StandardError(errorMessage, {
        code: 'TIMEOUT_ERROR',
        statusCode: 408,
        category: 'general',
        retryable: true,
        details: {
          originalError: error.name,
          operation: context.operation || 'unknown'
        }
      });
    }

    // Default generic error
    return new StandardError(errorMessage, {
      code: 'UNKNOWN_ERROR',
      statusCode: 500,
      category: 'general',
      retryable: false,
      details: {
        originalError: error.name || 'Unknown',
        stack: error.stack
      }
    });
  }

  /**
   * Error type detection methods
   */
  isDatabaseError(error) {
    const dbErrorPatterns = [
      'database', 'supabase', 'postgres', 'sql', 'connection',
      'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'PGRST'
    ];

    return dbErrorPatterns.some(pattern =>
      error.message?.toLowerCase().includes(pattern.toLowerCase()) ||
      error.code?.includes(pattern) ||
      error.name?.includes(pattern)
    );
  }

  isConnectionError(error) {
    const connectionErrorPatterns = [
      'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT',
      'network', 'connection', 'fetch', 'timeout'
    ];

    return connectionErrorPatterns.some(pattern =>
      error.message?.toLowerCase().includes(pattern.toLowerCase()) ||
      error.code?.includes(pattern) ||
      error.errno === 'ECONNREFUSED'
    );
  }

  isAuthError(error) {
    return error.statusCode === 401 ||
           error.message?.toLowerCase().includes('unauthorized') ||
           error.message?.toLowerCase().includes('authentication') ||
           error.code === 'UNAUTHORIZED';
  }

  isAuthorizationError(error) {
    return error.statusCode === 403 ||
           error.message?.toLowerCase().includes('forbidden') ||
           error.message?.toLowerCase().includes('access denied') ||
           error.code === 'FORBIDDEN';
  }

  isValidationError(error) {
    return error.statusCode === 400 ||
           error.name === 'ValidationError' ||
           error.message?.toLowerCase().includes('validation') ||
           error.message?.toLowerCase().includes('invalid');
  }

  isRateLimitError(error) {
    return error.statusCode === 429 ||
           error.message?.toLowerCase().includes('rate limit') ||
           error.message?.toLowerCase().includes('too many requests');
  }

  isExternalServiceError(error) {
    const serviceErrorPatterns = ['figma', 'mcp', 'api'];
    return serviceErrorPatterns.some(pattern =>
      error.message?.toLowerCase().includes(pattern)
    ) || (error.statusCode >= 500 && error.statusCode < 600);
  }

  isTimeoutError(error) {
    return error.message?.toLowerCase().includes('timeout') ||
           error.code === 'ETIMEDOUT' ||
           error.name === 'TimeoutError';
  }

  /**
   * Update error statistics
   */
  updateErrorStats(error) {
    this.errorStats.total++;
    this.errorStats.byCategory[error.category] = (this.errorStats.byCategory[error.category] || 0) + 1;
    this.errorStats.byCode[error.code] = (this.errorStats.byCode[error.code] || 0) + 1;

    // Keep recent errors (last 100)
    this.errorStats.recent.push({
      code: error.code,
      category: error.category,
      timestamp: error.timestamp,
      retryable: error.retryable
    });

    if (this.errorStats.recent.length > 100) {
      this.errorStats.recent = this.errorStats.recent.slice(-100);
    }
  }

  /**
   * Log error with appropriate level
   */
  logError(error, context = {}) {
    const logData = {
      code: error.code,
      category: error.category,
      statusCode: error.statusCode,
      retryable: error.retryable,
      context: context,
      details: error.details
    };

    if (error.statusCode >= 500) {
      logger.error(error.message, logData);
    } else if (error.statusCode >= 400) {
      logger.warn(error.message, logData);
    } else {
      logger.info(error.message, logData);
    }
  }

  /**
   * Express middleware for error handling
   */
  expressMiddleware() {
    return (error, req, res, next) => {
      const standardError = this.handle(error, {
        url: req.url,
        method: req.method,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      // Send standardized error response
      res.status(standardError.statusCode).json({
        success: false,
        error: {
          message: standardError.userMessage,
          code: standardError.code,
          retryable: standardError.retryable,
          timestamp: standardError.timestamp
        },
        ...(process.env.NODE_ENV === 'development' && {
          debug: {
            originalMessage: standardError.message,
            details: standardError.details
          }
        })
      });
    };
  }

  /**
   * Get error statistics
   */
  getStats() {
    return {
      ...this.errorStats,
      uptime: process.uptime(),
      circuitBreakers: circuitBreakerRegistry.getHealthStatus()
    };
  }

  /**
   * Clear error statistics
   */
  clearStats() {
    this.errorStats = {
      total: 0,
      byCategory: {},
      byCode: {},
      recent: []
    };
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

// Export convenience functions
export function handleError(error, context = {}) {
  return errorHandler.handle(error, context);
}

export function createStandardError(message, options = {}) {
  return new StandardError(message, options);
}