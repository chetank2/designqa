// This will be replaced at build time by tsup's define option
// __EXTENSION_BACKEND_URL__ is replaced with the actual URL string during build
declare const __EXTENSION_BACKEND_URL__: string | undefined;

// Use the defined URL if present, otherwise fallback to localhost
const url = typeof __EXTENSION_BACKEND_URL__ !== 'undefined' && __EXTENSION_BACKEND_URL__ 
  ? __EXTENSION_BACKEND_URL__ 
  : 'http://localhost:3847';

export const BACKEND_URL = url.trim().replace(/\/$/, '');
