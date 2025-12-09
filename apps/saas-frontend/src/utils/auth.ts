/**
 * Authentication utilities
 * Detects if authentication is required based on deployment mode
 */

/**
 * Check if authentication is required
 * In cloud deployments, auth is always required (Supabase is required)
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

    // Supabase is required for cloud deployments, so auth is always required
    return !!(supabaseUrl && supabaseKey);
  } catch (error) {
    // If there's any error checking, default to requiring auth (cloud deployments require Supabase)
    console.warn('Error checking auth requirement:', error);
    return true;
  }
}
