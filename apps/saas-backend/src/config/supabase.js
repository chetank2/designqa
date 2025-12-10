/**
 * Supabase Client Configuration
 * Provides typed Supabase client for both frontend and backend
 */
import { createClient } from '@supabase/supabase-js';
// Environment variables
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Server-side only
if (!supabaseUrl) {
    console.warn('⚠️ SUPABASE_URL not configured - Supabase features disabled');
}
/**
 * Create public Supabase client (for frontend/authenticated requests)
 * Uses anon key with RLS enforcement
 */
export function createPublicClient() {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
    }
    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    });
}
/**
 * Create service client (for server-side operations)
 * Uses service key to bypass RLS - USE WITH CAUTION
 */
export function createServiceClient() {
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase service key not configured. Set SUPABASE_SERVICE_KEY environment variable.');
    }
    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}
/**
 * Default public client instance
 */
export const supabase = supabaseUrl && supabaseAnonKey
    ? createPublicClient()
    : null;
