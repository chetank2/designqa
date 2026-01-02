/**
 * Database Initialization Helper
 * Initializes database adapter and services for use in API routes
 */

import { getDatabaseAdapter } from './index.js';
import { createServices } from '../services/index.js';
import { getStorageProvider } from '../config/storage-config.js';

let servicesInstance = null;
let adapterInstance = null;

/**
 * Initialize database and services
 * @param {Object} options - Initialization options
 * @param {string} [options.userId] - User ID for Supabase
 * @returns {Promise<Object>} Services object
 */
export async function initDatabase(options = {}) {
  // Return cached instance if available
  if (servicesInstance && adapterInstance) {
    return servicesInstance;
  }

  // Get database adapter (Supabase-only for cloud deployments)
  adapterInstance = await getDatabaseAdapter({
    userId: options.userId
  });

  // Get storage provider
  const storageProvider = getStorageProvider(options.userId);

  // Get encryption key
  const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.LOCAL_CREDENTIAL_KEY ||
    'local-credential-encryption-key-change-in-production';

  // Warn if encryption key is not configured
  if (!encryptionKey) {
    console.warn('⚠️ WARNING: CREDENTIAL_ENCRYPTION_KEY is not set!');
    console.warn('⚠️ Figma OAuth credentials cannot be encrypted/decrypted without this key.');
    console.warn('⚠️ Set CREDENTIAL_ENCRYPTION_KEY environment variable to enable credential storage.');
  } else {
    console.log('✅ Credential encryption key configured');
  }

  // Create services
  servicesInstance = createServices(adapterInstance, storageProvider, encryptionKey);

  return servicesInstance;
}

/**
 * Get services instance (must call initDatabase first)
 * @returns {Object} Services object
 */
export function getServices() {
  if (!servicesInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return servicesInstance;
}

/**
 * Get database adapter instance
 * @returns {DatabaseAdapter} Database adapter
 */
export function getAdapter() {
  if (!adapterInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return adapterInstance;
}

/**
 * Reset database instance (useful for testing)
 */
export function resetDatabase() {
  servicesInstance = null;
  adapterInstance = null;
}

export default {
  initDatabase,
  getServices,
  getAdapter,
  resetDatabase
};

