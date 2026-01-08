#!/usr/bin/env node
/**
 * Create Test Users in Supabase
 * Uses Supabase Admin API to create test users for development
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import crypto from 'crypto';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = resolve(__dirname, '..', '.env');
try {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0 && !key.startsWith('#')) {
      const value = valueParts.join('=').trim();
      if (value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  });
} catch (error) {
  console.warn('⚠️  Could not load .env file:', error.message);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration!');
  console.error('   Please set SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file');
  process.exit(1);
}

// Create admin client (uses service key to bypass RLS)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const testUsers = [
  {
    email: 'admin@test.com',
    password: process.env.TEST_USER_PASSWORD || crypto.randomBytes(16).toString('hex'),
    user_metadata: {
      full_name: 'Test Admin'
    }
  },
  {
    email: 'user@test.com',
    password: process.env.TEST_USER_PASSWORD || crypto.randomBytes(16).toString('hex'),
    user_metadata: {
      full_name: 'Test User'
    }
  }
];

// Log generated passwords for development use
if (!process.env.TEST_USER_PASSWORD) {
  console.log('Generated test passwords - set TEST_USER_PASSWORD env var to use custom password');
  testUsers.forEach(user => {
    console.log(`${user.email}: ${user.password}`);
  });
}

async function createTestUsers() {
  console.log('🔧 Creating test users in Supabase...\n');

  for (const userData of testUsers) {
    try {
      // Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const userExists = existingUsers?.users?.some(u => u.email === userData.email);

      if (userExists) {
        console.log(`⚠️  User ${userData.email} already exists, skipping...`);
        continue;
      }

      // Create user
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true, // Auto-confirm email
        user_metadata: userData.user_metadata
      });

      if (error) {
        console.error(`❌ Failed to create ${userData.email}:`, error.message);
        continue;
      }

      console.log(`✅ Created user: ${userData.email}`);
      console.log(`   User ID: ${data.user.id}`);
      console.log(`   Password: ${userData.password}`);
    } catch (error) {
      console.error(`❌ Error creating ${userData.email}:`, error.message);
    }
  }

  console.log('\n📋 Test Users Created:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  testUsers.forEach(user => {
    console.log(`\n📧 Email: ${user.email}`);
    console.log(`🔑 Password: ${user.password}`);
    console.log(`👤 Name: ${user.user_metadata.full_name}`);
  });
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✅ You can now login with these credentials in the application!');
}

createTestUsers().catch((error) => {
  console.error('❌ Script failed:', error.message);
  process.exit(1);
});

