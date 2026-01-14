/**
 * Database Module
 * Supabase-only adapter for SaaS deployment
 */

import { SupabaseAdapter } from './adapters/SupabaseAdapter.js';
import { LocalAdapter } from './adapters/LocalAdapter.js';
import { runMigrations, initializeSchema } from './migrations/MigrationRunner.js';

let adapterInstance = null;

/**
 * Get database adapter instance
 * @param {Object} options - Adapter options
 * @param {string} [options.userId] - User ID for Supabase
 * @returns {Promise<DatabaseAdapter>} Database adapter
 */
export async function getDatabaseAdapter(options = {}) {
  // Return cached instance if exists
  if (adapterInstance) {
    return adapterInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const forceLocal = process.env.DB_MODE === 'local' || process.env.FORCE_LOCAL_MODE === 'true';
  let adapter;

  if (supabaseUrl && !forceLocal) {
    // Create Supabase adapter
    adapter = new SupabaseAdapter(options.userId);
  } else {
    // Create Local adapter
    if (forceLocal) {
      // Removed: console.log('configured for Local Mode (DB_MODE=local or FORCE_LOCAL_MODE=true).');
    } else {
      console.log('⚠️ SUPABASE_URL not set. Using LocalAdapter.');
    }
    adapter = new LocalAdapter(options.userId);
  }

  // Connect
  await adapter.connect();

  // Initialize schema and run migrations (skip for local if minimal/not needed, or implement local migrations)
  try {
    // For local adapter, schema is implicit in JSON structure, but we might want to run initial setup if needed.
    // MigrationRunner likely expects SQL support which LocalAdapter lacks (throws on query).
    if (adapter.getType() === 'supabase') {
      await initializeSchema(adapter);
      const applied = await runMigrations(adapter);
      if (applied.length > 0) {
        // Removed: console.log(`✅ Applied ${applied.length} migration(s)`);
      }
    }
  } catch (error) {
    console.warn('⚠️ Migration failed:', error.message);
    // Continue anyway - schema might already be initialized
  }

  adapterInstance = adapter;

  return adapter;
}

/**
 * Reset adapter instance (useful for testing)
 */
export function resetAdapter() {
  adapterInstance = null;
}

/**
 * Get current adapter type
 * @returns {string} Adapter type
 */
export function getAdapterType() {
  if (adapterInstance) return adapterInstance.getType();

  const forceLocal = process.env.DB_MODE === 'local' || process.env.FORCE_LOCAL_MODE === 'true';
  return (process.env.SUPABASE_URL && !forceLocal) ? 'supabase' : 'local';
}

export default {
  getDatabaseAdapter,
  resetAdapter,
  getAdapterType
};
