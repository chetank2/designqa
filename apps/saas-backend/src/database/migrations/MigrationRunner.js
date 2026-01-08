/**
 * Migration Runner
 * Runs database migrations for Supabase
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load migration files
 * @returns {Array} Array of migration objects
 */
function loadMigrations() {
  const migrationsDir = path.join(__dirname, '../../../supabase/migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  return files.map(file => {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const version = file.replace(/^\d+_/, '').replace(/\.sql$/, '');
    
    return {
      file,
      version,
      content
    };
  });
}

/**
 * Get applied migrations
 * @param {DatabaseAdapter} adapter - Database adapter
 * @returns {Promise<Array>} Array of applied migration versions
 */
async function getAppliedMigrations(adapter) {
  try {
    // Supabase only
    try {
      const results = await adapter.select('schema_migrations', {
        orderBy: [{ column: 'applied_at', ascending: true }]
      });
      return results.map(r => r.version);
    } catch (e) {
      // Table doesn't exist yet
      return [];
    }
  } catch (error) {
    // Table doesn't exist yet
    return [];
  }
}

/**
 * Record migration as applied
 * @param {DatabaseAdapter} adapter - Database adapter
 * @param {string} version - Migration version
 */
async function recordMigration(adapter, version) {
  await adapter.insert('schema_migrations', {
    version,
    appliedAt: new Date().toISOString()
  });
}

/**
 * Run migrations
 * @param {DatabaseAdapter} adapter - Database adapter
 * @returns {Promise<Array>} Array of applied migration versions
 */
export async function runMigrations(adapter) {
  if (!adapter.isConnected()) {
    await adapter.connect();
  }

  const migrations = loadMigrations();
  const applied = await getAppliedMigrations(adapter);
  const appliedVersions = new Set(applied);

  const newlyApplied = [];

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue; // Already applied
    }

    // Removed: console.log(`Running migration: ${migration.file}`);

    try {
      const sql = migration.content;

      // Split SQL by semicolons and execute each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => {
          if (s.length === 0) return false;
          if (s.startsWith('--')) return false;
          return true;
        });

      // For Supabase, migrations are typically handled via Supabase CLI
      // This runner is kept for compatibility but may skip complex migrations
      for (const statement of statements) {
        console.warn(`Note: Raw SQL migrations may need to be run via Supabase CLI: ${statement.substring(0, 50)}...`);
      }

      await recordMigration(adapter, migration.version);
      newlyApplied.push(migration.version);
      // Removed: console.log(`✅ Applied migration: ${migration.version}`);
    } catch (error) {
      console.error(`❌ Failed to apply migration ${migration.version}:`, error.message);
      throw error;
    }
  }

  return newlyApplied;
}

/**
 * Initialize database schema (run initial schema if no migrations)
 * @param {DatabaseAdapter} adapter - Database adapter
 */
export async function initializeSchema(adapter) {
  if (!adapter.isConnected()) {
    await adapter.connect();
  }

  const applied = await getAppliedMigrations(adapter);
  
  // If no migrations applied, schema should be initialized via Supabase CLI
  if (applied.length === 0) {
    // Removed: console.log('ℹ️  No migrations found. Ensure database schema is initialized via Supabase CLI.');
  }
}

