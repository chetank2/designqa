/**
 * Database Module
 * Supabase-only adapter for SaaS deployment
 */

import { SupabaseAdapter } from './adapters/SupabaseAdapter.js';
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

  // Create Supabase adapter
  const adapter = new SupabaseAdapter(options.userId);

  // Connect
  await adapter.connect();

  // Initialize schema and run migrations
  try {
    await initializeSchema(adapter);
    const applied = await runMigrations(adapter);
    if (applied.length > 0) {
      console.log(`✅ Applied ${applied.length} migration(s)`);
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
 * @returns {'supabase'} Adapter type - always supabase in SaaS mode
 */
export function getAdapterType() {
  return 'supabase';
}

export default {
  getDatabaseAdapter,
  resetAdapter,
  getAdapterType
};
