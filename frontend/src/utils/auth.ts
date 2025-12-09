/**
 * Authentication utilities
 * Detects if authentication is required based on deployment mode
 */

/**
 * Check if authentication is required
 * In SaaS mode (Vercel/Railway), auth is always required
 * In desktop mode, auth is optional
 */
export function isAuthRequired(): boolean {
  // Lazy import to avoid circular dependency issues
  try {
    // Check if Supabase environment variables are configured
    const supabaseUrl = typeof window !== 'undefined' 
      ? (import.meta.env?.VITE_SUPABASE_URL || window.__env?.VITE_SUPABASE_URL)
      : undefined;
    const supabaseKey = typeof window !== 'undefined'
      ? (import.meta.env?.VITE_SUPABASE_ANON_KEY || window.__env?.VITE_SUPABASE_ANON_KEY)
      : undefined;

    // If Supabase is not configured, auth is not required (desktop mode)
    if (!supabaseUrl || !supabaseKey) {
      return false;
    }

    // Always require auth if Supabase is configured (Online-Only SaaS mode)
    return true;
  } catch (error) {
    // If there's any error checking, default to not requiring auth
    console.warn('Error checking auth requirement:', error);
    return false;
  }
}
