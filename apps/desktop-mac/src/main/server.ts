/**
 * Embedded Express Server
 * Reuses saas-backend server with local configuration
 */

// @ts-ignore - Backend is JavaScript, skip type checking
import { startServer } from '../../../saas-backend/src/core/server/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load environment variables for desktop app
 */
function loadDesktopEnv() {
  const envPaths = [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../../.env')
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath });
      console.log(`📄 Loaded environment from: ${envPath}`);
      break;
    }
  }

  // Set desktop-specific defaults
  process.env.DEPLOYMENT_MODE = 'desktop';
  process.env.DATABASE_URL = process.env.DATABASE_URL || join(__dirname, '../../../data/app.db');
  
  // Disable Supabase for desktop mode unless explicitly configured
  if (!process.env.SUPABASE_URL) {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
  }
}

/**
 * Start embedded server
 * @returns {Promise<number>} Port number
 */
export async function startEmbeddedServer(): Promise<number> {
  loadDesktopEnv();

  // Use port from env or default
  const port = parseInt(process.env.PORT || '3847', 10);

  try {
    await startServer(port);
    console.log(`✅ Embedded server running on http://localhost:${port}`);
    return port;
  } catch (error) {
    console.error('❌ Failed to start embedded server:', error);
    throw error;
  }
}
