/**
 * Authentication Middleware
 * In Local-First mode every request is treated as coming from the local user.
 */

const LOCAL_USER = {
  id: process.env.LOCAL_USER_ID || 'local-user',
  email: null,
  created_at: new Date().toISOString()
};

/**
 * Attach a local user context to the request
 */
export async function extractUser(req, res, next) {
  req.user = LOCAL_USER;
  next();
}

export function requireAuth(req, res, next) {
  next();
}

export function optionalAuth(req, res, next) {
  next();
}
