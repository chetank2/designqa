import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

const DEFAULT_RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_EXTRACTION_MAX = 10;
const DEFAULT_HEALTH_MAX = 60;

// Default allowed origins for web app -> desktop communication
const DEFAULT_WEB_ORIGINS = [
  'https://designqa-ck.vercel.app',
  'https://designqa-ck-git-main.vercel.app',
  'http://localhost:3846',
  'http://localhost:5173',
  'http://127.0.0.1:3846',
  'http://127.0.0.1:5173'
];

/**
 * Configure baseline security middleware shared across deployments.
 */
export function configureSecurityMiddleware(app, config = {}) {
  if (!app) return;

  const security = config.security || {};
  const corsConfig = security.cors || {};
  const configuredOriginsRaw = corsConfig.allowedOrigins || security.allowedOrigins;
  const configuredOrigins = typeof configuredOriginsRaw === 'string'
    ? configuredOriginsRaw.split(',').map(origin => origin.trim()).filter(Boolean)
    : configuredOriginsRaw;

  // Determine allowed origins based on configuration
  // IMPORTANT: If origins are explicitly configured, respect that without adding defaults
  // This prevents security regressions when users want strict origin control
  let allowedOrigins;
  if (configuredOrigins && configuredOrigins.length > 0) {
    // User explicitly configured origins - use ONLY those (strict mode)
    allowedOrigins = configuredOrigins;
  } else {
    // No explicit config - use defaults in local/desktop mode, allow all in cloud mode
    const isLocalMode = process.env.RUNNING_IN_ELECTRON === 'true' ||
      (!process.env.RENDER && !process.env.VERCEL && !process.env.RAILWAY_ENVIRONMENT);
    allowedOrigins = isLocalMode ? DEFAULT_WEB_ORIGINS : true;
  }

  const corsOptions = {
    origin: allowedOrigins,
    credentials: true,
    methods: corsConfig.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: corsConfig.allowedHeaders || ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With']
  };

  app.set('trust proxy', 1);

  // Private Network Access (PNA) support for localhost API access from HTTPS web app
  // MUST be registered BEFORE generic CORS handlers to intercept OPTIONS requests
  // This allows web apps on HTTPS to access localhost HTTP services
  // See: https://developer.chrome.com/blog/private-network-access-preflight
  app.options('/api/*', (req, res) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins === true || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    res.status(204).end();
  });

  // Add PNA header to actual /api requests
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
  });

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  app.use(helmet({
    contentSecurityPolicy: false, // Allow frontend to define dynamically
    crossOriginEmbedderPolicy: false
  }));
  app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
  app.use(compression());
}

/**
 * Express-compatible logger using morgan.
 */
export const requestLogger = morgan(':method :url :status :res[content-length] - :response-time ms', {
  skip: () => process.env.NODE_ENV === 'test'
});

/**
 * Adds helper response methods so routes can call res.success/res.error.
 */
export function responseFormatter(_req, res, next) {
  res.success = (payload = {}, status = 200) => {
    const body = typeof payload === 'object' && payload !== null
      ? { success: true, ...payload }
      : { success: true, data: payload };
    return res.status(status).json(body);
  };

  res.error = (message, status = 500, details = null) => {
    const body = {
      success: false,
      error: message || 'Unexpected server error'
    };
    if (details && typeof details === 'object') {
      body.details = details;
    }
    return res.status(status).json(body);
  };

  next();
}

/**
 * Build reusable rate limiters for different routes.
 */
export function configureRateLimit(config = {}) {
  const rateConfig = config.security?.rateLimit || {};
  const windowMs = Number(rateConfig.windowMs) || DEFAULT_RATE_LIMIT_WINDOW;
  const max = Number(rateConfig.max) || DEFAULT_MAX_REQUESTS;
  const extractionMax = Number(rateConfig.extractionMax) || DEFAULT_EXTRACTION_MAX;

  const baseOptions = {
    standardHeaders: true,
    legacyHeaders: false
  };

  const generalLimiter = rateLimit({
    ...baseOptions,
    windowMs,
    max
  });

  const healthLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 1000,
    max: Number(rateConfig.healthMax) || DEFAULT_HEALTH_MAX
  });

  const extractionLimiter = rateLimit({
    ...baseOptions,
    windowMs,
    max: extractionMax,
    message: {
      success: false,
      error: 'Too many extraction requests. Please try again later.'
    }
  });

  return { generalLimiter, healthLimiter, extractionLimiter };
}

/**
 * Validate target URLs against allowed host list.
 */
export function validateExtractionUrl(allowedHosts = []) {
  const normalizedHosts = Array.isArray(allowedHosts)
    ? allowedHosts.filter(Boolean).map(host => host.trim().toLowerCase())
    : [];

  return (req, res, next) => {
    const targetUrl = req.body?.figmaUrl || req.body?.url || req.query?.figmaUrl || req.query?.url;

    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'figmaUrl is required'
      });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const enforceHosts = normalizedHosts.length > 0 && !normalizedHosts.includes('*');

    if (enforceHosts) {
      const isAllowed = normalizedHosts.some(allowed => hostname === allowed || hostname.endsWith(`.${allowed}`));
      if (!isAllowed) {
        return res.status(403).json({
          success: false,
          error: `URL host "${hostname}" is not allowed`
        });
      }
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(403).json({
        success: false,
        error: 'Only HTTP/HTTPS URLs are allowed'
      });
    }

    next();
  };
}

/**
 * 404 handler for API routes.
 */
export function notFoundHandler(_req, res) {
  return res.status(404).json({
    success: false,
    error: 'Resource not found'
  });
}

/**
 * Centralized Express error handler.
 */
export function errorHandler(err, _req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  if (process.env.NODE_ENV !== 'test') {
    console.error('Server error:', err);
  }
  if (res.headersSent) {
    return next(err);
  }
  return res.status(status).json({
    success: false,
    error: message
  });
}
