/**
 * Authentication utilities
 * Detects if authentication is required based on deployment mode
 */

import { supabase } from '../lib/supabase';

/**
 * Check if authentication is required
 * In SaaS mode (Vercel/Railway), auth is always required
 * In desktop mode, auth is optional
 */
export function isAuthRequired(): boolean {
  // If Supabase is not configured, auth is not required (desktop mode)
  if (!supabase) {
    return false;
  }

  // Always require auth if Supabase is configured (Online-Only SaaS mode)
  return true;
}
