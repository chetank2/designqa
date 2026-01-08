/**
 * Centralized port configuration for the frontend
 * This ensures consistent port usage across the frontend application
 */

// Determine the unified server port (defaults to 3847 for both web + mac)
const resolveConfiguredPort = (): number => {
  const envPort = (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env.VITE_SERVER_PORT
    : undefined;

  const parsed = envPort ? parseInt(envPort, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : 3847;
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const safeHostname = (value?: string): string | null => {
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

const isLocalHostname = (host?: string | null): boolean => {
  if (!host) {
    return false;
  }

  return LOCAL_HOSTNAMES.has(host) || host.endsWith('.local');
};

const shouldUseConfiguredUrl = (url?: string): boolean => {
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

  // If we are served from a non-local domain but the configured URL points to localhost,
  // prefer the current origin to avoid CORS issues.
  if (!isLocalHostname(originHost) && isLocalHostname(configuredHost)) {
    return false;
  }

  return true;
};

export const APP_SERVER_PORT = resolveConfiguredPort();

// Default port for the backend server (web app) - Unified Architecture  
export const DEFAULT_SERVER_PORT = APP_SERVER_PORT;

// macOS app port - Uses same unified port
export const MACOS_APP_PORT = APP_SERVER_PORT;

// Electron detection removed - cloud deployments only

// Type declaration for Vite's import.meta.env
interface ImportMetaEnv {
  MODE: string;
  VITE_SERVER_PORT?: string;
  VITE_API_URL?: string;
  VITE_WS_URL?: string;
  [key: string]: any;
}

// Augment the import.meta
declare global {
  interface ImportMeta {
    env: ImportMetaEnv;
  }
}

// Get the server port from environment variables or use the default
export function getServerPort(): number {
  // Check for the global __SERVER_PORT__ defined in vite.config.ts
  // @ts-ignore - This is defined in vite.config.ts
  const definedPort = typeof __SERVER_PORT__ !== 'undefined' ? __SERVER_PORT__ : null;
  
  // Check for environment variable
  const env = import.meta.env;
  const envPort = env.VITE_SERVER_PORT;
  
  // Parse the port from environment or use default
  const port = definedPort || (envPort ? parseInt(envPort, 10) : DEFAULT_SERVER_PORT);
  
  return port;
}

// Check if running in Electron
function isElectronEnv(): boolean {
  return typeof window !== 'undefined' && 
         typeof (window as any).electronAPI !== 'undefined';
}

// Default cloud API URL for Electron Cloud mode
const DEFAULT_CLOUD_API_URL = 'https://designqa.onrender.com';

// Get the API base URL with the correct port
export function getApiBaseUrl(): string {
  const envApiUrl = import.meta.env.VITE_API_URL;
  const isElectron =
    typeof window !== 'undefined' &&
    typeof (window as any).electronAPI !== 'undefined';

  if (!isElectron && envApiUrl && shouldUseConfiguredUrl(envApiUrl)) {
    return envApiUrl;
  }

  if (typeof window !== 'undefined') {
    const runtimeApiUrl = (window as any).__env?.VITE_API_URL;
    if (runtimeApiUrl && shouldUseConfiguredUrl(runtimeApiUrl)) {
      return runtimeApiUrl;
    }
  }

  return `http://localhost:${APP_SERVER_PORT}`;
}

// Get WebSocket URL with the correct port
export function getWebSocketUrl(): string {
  const env = import.meta.env;
  
  if (env.VITE_WS_URL && shouldUseConfiguredUrl(env.VITE_WS_URL)) {
    return env.VITE_WS_URL;
  }

  if (typeof window !== 'undefined') {
    const runtimeWsUrl = (window as any).__env?.VITE_WS_URL;
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
  
  return `ws://localhost:${getServerPort()}`;
}
