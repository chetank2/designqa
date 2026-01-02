/**
 * Supabase Client Stub (Local-First Mode)
 * All Supabase interactions are disabled so the desktop app can rely solely on local storage.
 */

export function getSupabaseClient() {
  console.warn('Supabase client requested, but cloud features are frozen in Local-First Mode.');
  return null;
}

export default {
  getSupabaseClient
};
