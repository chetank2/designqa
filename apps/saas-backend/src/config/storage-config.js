/**
 * Storage Configuration
 * Detects storage mode and provides appropriate StorageProvider instance
 */

import { SupabaseStorageProvider } from '../storage/SupabaseStorageProvider.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';

let storageProviderInstance = null;
let storageMode = null;

/**
 * Detect storage mode based on environment
 * @returns {'supabase'|'local'} Storage mode
 */
export function detectStorageMode() {
  // Check if Supabase is configured
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    return 'supabase';
  }
  // Fall back to local storage if Supabase not configured
  return 'local';
}

/**
 * Get storage provider instance
 * @param {string} [userId] - User ID for Supabase storage (optional for local)
 * @returns {StorageProvider} Storage provider instance
 */
export function getStorageProvider(userId = null) {
  // Return cached instance if mode hasn't changed
  const currentMode = detectStorageMode();
  
  if (storageProviderInstance && storageMode === currentMode) {
    // Update userId if provided and using Supabase
    if (currentMode === 'supabase' && userId && storageProviderInstance.userId !== userId) {
      storageProviderInstance.userId = userId;
    }
    return storageProviderInstance;
  }
  
  // Create new instance based on mode
  storageMode = currentMode;
  
  if (storageMode === 'supabase') {
    try {
      storageProviderInstance = new SupabaseStorageProvider(userId);
    } catch (error) {
      console.warn('⚠️ Failed to initialize Supabase storage, falling back to local:', error.message);
      // Fall back to local storage
      storageMode = 'local';
      storageProviderInstance = new LocalStorageProvider();
    }
  } else {
    // Use local storage
    storageProviderInstance = new LocalStorageProvider();
  }
  
  return storageProviderInstance;
}

/**
 * Check if Supabase storage is available
 * @returns {Promise<boolean>} Availability status
 */
export async function isSupabaseStorageAvailable() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return false;
  }
  
  try {
    const provider = new SupabaseStorageProvider();
    return await provider.isAvailable();
  } catch (error) {
    return false;
  }
}

/**
 * Get current storage mode
 * @returns {'supabase'} Current storage mode (always Supabase for cloud deployments)
 */
export function getStorageMode() {
  if (!storageMode) {
    storageMode = detectStorageMode();
  }
  return storageMode;
}

/**
 * Reset storage provider instance (useful for testing or mode changes)
 */
export function resetStorageProvider() {
  storageProviderInstance = null;
  storageMode = null;
}

export default {
  detectStorageMode,
  getStorageProvider,
  isSupabaseStorageAvailable,
  getStorageMode,
  resetStorageProvider
};
