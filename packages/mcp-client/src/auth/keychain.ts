/**
 * OS Keychain Integration
 * Secure storage for OAuth tokens using OS keychain
 */

import * as os from 'os';

let keytar: any = null;
let keytarLoaded = false;

// Lazy load keytar on first use (ES module compatible)
async function loadKeytar() {
  if (keytarLoaded) {
    return keytar;
  }
  
  try {
    const keytarModule = await import('keytar');
    keytar = keytarModule.default || keytarModule;
    keytarLoaded = true;
  } catch (error) {
    console.warn('⚠️ keytar not available, tokens will be stored in memory only');
    keytarLoaded = true; // Mark as loaded even if failed to prevent retries
  }
  
  return keytar;
}

const SERVICE_NAME = 'DesignQA';
const ACCOUNT_NAME = 'figma-oauth-token';

/**
 * Store OAuth token securely in OS keychain
 * @param token - OAuth token to store
 * @param userId - Optional user ID for multi-user support
 */
export async function storeToken(token: string, userId?: string): Promise<void> {
  const keytarModule = await loadKeytar();
  if (!keytarModule) {
    console.warn('⚠️ Keychain not available, token not persisted');
    return;
  }

  try {
    const account = userId ? `${ACCOUNT_NAME}-${userId}` : ACCOUNT_NAME;
    await keytarModule.setPassword(SERVICE_NAME, account, token);
    console.log('✅ Token stored in keychain');
  } catch (error) {
    console.error('❌ Failed to store token in keychain:', error);
    throw error;
  }
}

/**
 * Retrieve OAuth token from OS keychain
 * @param userId - Optional user ID for multi-user support
 * @returns Token or null if not found
 */
export async function getToken(userId?: string): Promise<string | null> {
  const keytarModule = await loadKeytar();
  if (!keytarModule) {
    return null;
  }

  try {
    const account = userId ? `${ACCOUNT_NAME}-${userId}` : ACCOUNT_NAME;
    const token = await keytarModule.getPassword(SERVICE_NAME, account);
    return token;
  } catch (error) {
    console.error('❌ Failed to retrieve token from keychain:', error);
    return null;
  }
}

/**
 * Delete OAuth token from OS keychain
 * @param userId - Optional user ID for multi-user support
 */
export async function deleteToken(userId?: string): Promise<void> {
  const keytarModule = await loadKeytar();
  if (!keytarModule) {
    return;
  }

  try {
    const account = userId ? `${ACCOUNT_NAME}-${userId}` : ACCOUNT_NAME;
    await keytarModule.deletePassword(SERVICE_NAME, account);
    // Removed: console.log('✅ Token deleted from keychain');
  } catch (error) {
    console.error('❌ Failed to delete token from keychain:', error);
  }
}

/**
 * Check if keychain is available
 */
export async function isKeychainAvailable(): Promise<boolean> {
  const keytarModule = await loadKeytar();
  return keytarModule !== null;
}

/**
 * Get platform-specific keychain name
 */
export function getKeychainName(): string {
  const platform = os.platform();
  switch (platform) {
    case 'darwin':
      return 'macOS Keychain';
    case 'win32':
      return 'Windows Credential Manager';
    case 'linux':
      return 'libsecret';
    default:
      return 'OS Keychain';
  }
}
