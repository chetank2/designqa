#!/usr/bin/env node
/**
 * Interactive Supabase Setup Script
 * Helps configure Supabase connection for the project
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('🔧 Supabase Setup Wizard\n');
  console.log('You can find these values in your Supabase dashboard:');
  console.log('  Settings → API → Project URL, anon key, service_role key\n');

  const supabaseUrl = await question('Enter your Supabase URL (e.g., https://xxxxx.supabase.co): ');
  const supabaseAnonKey = await question('Enter your Supabase Anon Key: ');
  const supabaseServiceKey = await question('Enter your Supabase Service Role Key: ');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('❌ All fields are required!');
    process.exit(1);
  }

  // Read existing .env file
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  } else {
    // Copy from example if .env doesn't exist
    const examplePath = path.join(rootDir, 'env.example');
    if (fs.existsSync(examplePath)) {
      envContent = fs.readFileSync(examplePath, 'utf-8');
    }
  }

  // Update or add Supabase configuration
  const lines = envContent.split('\n');
  const updatedLines = [];
  let supabaseUrlFound = false;
  let supabaseAnonKeyFound = false;
  let supabaseServiceKeyFound = false;
  let viteSupabaseUrlFound = false;
  let viteSupabaseAnonKeyFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('SUPABASE_URL=') || line.startsWith('# SUPABASE_URL=')) {
      updatedLines.push(`SUPABASE_URL=${supabaseUrl}`);
      supabaseUrlFound = true;
    } else if (line.startsWith('SUPABASE_ANON_KEY=') || line.startsWith('# SUPABASE_ANON_KEY=')) {
      updatedLines.push(`SUPABASE_ANON_KEY=${supabaseAnonKey}`);
      supabaseAnonKeyFound = true;
    } else if (line.startsWith('SUPABASE_SERVICE_KEY=') || line.startsWith('# SUPABASE_SERVICE_KEY=')) {
      updatedLines.push(`SUPABASE_SERVICE_KEY=${supabaseServiceKey}`);
      supabaseServiceKeyFound = true;
    } else if (line.startsWith('VITE_SUPABASE_URL=') || line.startsWith('# VITE_SUPABASE_URL=')) {
      updatedLines.push(`VITE_SUPABASE_URL=${supabaseUrl}`);
      viteSupabaseUrlFound = true;
    } else if (line.startsWith('VITE_SUPABASE_ANON_KEY=') || line.startsWith('# VITE_SUPABASE_ANON_KEY=')) {
      updatedLines.push(`VITE_SUPABASE_ANON_KEY=${supabaseAnonKey}`);
      viteSupabaseAnonKeyFound = true;
    } else {
      updatedLines.push(line);
    }
  }

  // Add missing variables if they weren't found
  if (!supabaseUrlFound) {
    updatedLines.push(`SUPABASE_URL=${supabaseUrl}`);
  }
  if (!supabaseAnonKeyFound) {
    updatedLines.push(`SUPABASE_ANON_KEY=${supabaseAnonKey}`);
  }
  if (!supabaseServiceKeyFound) {
    updatedLines.push(`SUPABASE_SERVICE_KEY=${supabaseServiceKey}`);
  }
  if (!viteSupabaseUrlFound) {
    updatedLines.push(`VITE_SUPABASE_URL=${supabaseUrl}`);
  }
  if (!viteSupabaseAnonKeyFound) {
    updatedLines.push(`VITE_SUPABASE_ANON_KEY=${supabaseAnonKey}`);
  }

  // Write updated .env file
  fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf-8');
  console.log('\n✅ Updated .env file with Supabase credentials');

  // Sync to frontend/.env
  console.log('🔄 Syncing VITE_ variables to frontend/.env...');
  const { execSync } = await import('child_process');
  try {
    execSync('node scripts/sync-env-vars.js', { cwd: rootDir, stdio: 'inherit' });
    console.log('✅ Synced frontend environment variables');
  } catch (error) {
    console.warn('⚠️  Could not sync frontend env vars:', error.message);
  }

  console.log('\n📋 Next steps:');
  console.log('1. Deploy the database schema to Supabase:');
  console.log('   - Go to your Supabase dashboard → SQL Editor');
  console.log('   - Copy contents of supabase/schema.sql');
  console.log('   - Paste and run in SQL Editor');
  console.log('\n2. Restart your server:');
  console.log('   npm start');
  console.log('\n3. Rebuild frontend:');
  console.log('   cd frontend && npm run build');

  rl.close();
}

main().catch((error) => {
  console.error('❌ Setup failed:', error.message);
  rl.close();
  process.exit(1);
});

