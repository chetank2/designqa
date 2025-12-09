/**
 * Storage Configuration
 * Detects storage mode and provides appropriate StorageProvider instance
 */

import { SupabaseStorageProvider } from '../storage/SupabaseStorageProvider.js';

let storageProviderInstance = null;
let storageMode = null;

/**
 * Detect storage mode based on environment
 * @returns {'supabase'} Storage mode (always Supabase for cloud deployments)
 */
export function detectStorageMode() {
  // Cloud deployments always use Supabase
  return 'supabase';
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
  
  // Create new instance based on mode (always Supabase for cloud deployments)
  storageMode = currentMode;
  
  if (storageMode === 'supabase') {
    try {
      storageProviderInstance = new SupabaseStorageProvider(userId);
    } catch (error) {
      console.error('❌ Failed to initialize Supabase storage:', error.message);
      throw new Error('Supabase storage is required for cloud deployments. Please configure SUPABASE_URL and related environment variables.');
    }
  } else {
    throw new Error(`Unsupported storage mode: ${storageMode}. Only 'supabase' is supported for cloud deployments.`);
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
