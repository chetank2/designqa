const envUrl = typeof process !== 'undefined' && process.env && process.env.EXTENSION_BACKEND_URL;

export const BACKEND_URL = (envUrl && envUrl.trim()
  ? envUrl.trim()
  : 'http://localhost:3847'
).replace(/\/$/, '');
