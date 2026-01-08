/**
 * Node.js compatible environment utilities
 * This is a fallback for when the TypeScript version can't be loaded in Node.js
 */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const DEFAULT_PORT = process.env.VITE_SERVER_PORT || '3847';

const safeHostname = (value) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch (error) {
    try {
      return new URL(`http://${value}`).hostname;
    } catch (_err) {
      return null;
    }
  }
};

const isLocalHostname = (host) => {
  if (!host) {
    return false;
  }

  return LOCAL_HOSTNAMES.has(host) || host.endsWith('.local');
};

const shouldUseConfiguredUrl = (url) => {
  if (!url) {
    return false;
  }

  if (typeof window === 'undefined') {
    return true;
  }

  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file://')) {
    return true;
  }

  const originHost = safeHostname(origin);
  const configuredHost = safeHostname(url);

  if (!originHost || !configuredHost) {
    return true;
  }

  if (!isLocalHostname(originHost) && isLocalHostname(configuredHost)) {
    return false;
  }

  return true;
};

// Simple fallback for Node.js testing
export function getApiBaseUrl() {
  const envApiUrl = process.env.VITE_API_URL;
  if (envApiUrl && shouldUseConfiguredUrl(envApiUrl)) {
    return envApiUrl;
  }

  // In browser context, use window.location.origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (origin && origin !== 'null' && !origin.startsWith('file://')) {
      return origin;
    }
  }
  // Fallback for Node.js or when window is not available
  return `http://localhost:${DEFAULT_PORT}`;
}

export function getWebSocketUrl() {
  const envWsUrl = process.env.VITE_WS_URL;
  if (envWsUrl && shouldUseConfiguredUrl(envWsUrl)) {
    return envWsUrl;
  }

  if (typeof window !== 'undefined') {
    const runtimeWsUrl = window.__env?.VITE_WS_URL;
    if (runtimeWsUrl && shouldUseConfiguredUrl(runtimeWsUrl)) {
      return runtimeWsUrl;
    }

    const origin = window.location?.origin;
    if (origin && origin !== 'null' && !origin.startsWith('file://')) {
      const protocol = origin.startsWith('https') ? 'wss' : 'ws';
      const host = window.location.host;
      return `${protocol}://${host}`;
    }
  }

  return `ws://localhost:${DEFAULT_PORT}`;
}

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  VITE_API_URL: process.env.VITE_API_URL,
  VITE_WS_URL: process.env.VITE_WS_URL,
  VITE_SERVER_PORT: process.env.VITE_SERVER_PORT || '3847',
};

export const isDevelopment = ENV.NODE_ENV === 'development';
export const isProduction = ENV.NODE_ENV === 'production';

export const FEATURES = {
  ENABLE_ANALYTICS: true,
  ENABLE_AI_INSIGHTS: true,
  ENABLE_REAL_TIME: true,
  ENABLE_NOTIFICATIONS: false,
  ENABLE_AUTH: false,
  ENABLE_WEB_EXTRACTION: true,
  ENABLE_VISUAL_COMPARISON: true,
};

export function logEnvironmentInfo() {
  if (isDevelopment) {
    console.log('🔧 Environment Configuration (Node.js fallback)');
    // Removed: console.log('NODE_ENV:', ENV.NODE_ENV);
    // Removed: console.log('API Base URL:', getApiBaseUrl());
    // Removed: console.log('WebSocket URL:', getWebSocketUrl());
  }
}
