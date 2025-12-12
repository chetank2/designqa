import crypto from 'crypto';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from './CredentialEncryption.js';

/**
 * Service to handle Figma OAuth authentication and token management
 */
export class FigmaAuthService {
    constructor(dbAdapter, encryptionKey) {
        this.db = dbAdapter;
        this.encryptionKey = encryptionKey;
        this.algo = 'aes-256-gcm';
        
        // Log encryption key status (not the actual key) for debugging
        if (!encryptionKey) {
            console.warn('⚠️ FigmaAuthService: No encryption key provided. CREDENTIAL_ENCRYPTION_KEY environment variable may not be set.');
        } else {
            console.log('✅ FigmaAuthService: Encryption key configured');
        }
    }
    
    /**
     * Check if encryption is properly configured
     */
    isEncryptionConfigured() {
        return this.encryptionKey !== null && 
               this.encryptionKey !== undefined && 
               typeof this.encryptionKey === 'string' && 
               this.encryptionKey.length > 0;
    }

    /**
     * Save or update user's Figma App credentials
     * @param {string} userId - User ID
     * @param {string} clientId - Figma App Client ID
     * @param {string} clientSecret - Figma App Client Secret
     */
    async saveCredentials(userId, clientId, clientSecret) {
        if (!clientId || !clientSecret) {
            throw new Error('Client ID and Secret are required');
        }

        // Check encryption configuration before attempting to encrypt
        if (!this.isEncryptionConfigured()) {
            throw new Error('Cannot save credentials: CREDENTIAL_ENCRYPTION_KEY environment variable is not configured on the server.');
        }

        console.log('Saving Figma credentials for user:', userId);
        console.log('Encryption key configured:', this.isEncryptionConfigured());

        const encryptedSecret = encrypt(clientSecret, this.encryptionKey);

        // Upsert credentials
        const { error } = await this.db.upsertFigmaCredentials({
            user_id: userId,
            client_id: clientId,
            client_secret: encryptedSecret,
            updated_at: new Date().toISOString()
        });

        if (error) throw error;
        console.log('Figma credentials saved successfully');
        return true;
    }

    /**
     * Get user's Figma App credentials
     * @param {string} userId
     */
    async getCredentials(userId) {
        try {
            const data = await this.db.getFigmaCredentials(userId);
            if (!data) {
                console.log(`Figma credentials: No data found for user ${userId}`);
                return null;
            }

            // Log raw data structure for debugging (without sensitive values)
            console.log('Figma credentials raw data keys:', Object.keys(data));

            // Handle potential missing or undefined fields from database
            // Support both snake_case (from DB) and camelCase (after conversion)
            const safeData = {
                clientId: data.client_id || data.clientId || null,
                clientSecret: data.client_secret || data.clientSecret || null,
                accessToken: data.access_token || data.accessToken || null,
                refreshToken: data.refresh_token || data.refreshToken || null,
                expiresAt: data.expires_at || data.expiresAt || null
            };

            console.log('Figma credentials safeData:', {
                hasClientId: !!safeData.clientId,
                hasClientSecret: !!safeData.clientSecret,
                clientSecretType: typeof safeData.clientSecret,
                clientSecretLength: safeData.clientSecret?.length || 0,
                hasAccessToken: !!safeData.accessToken,
                hasRefreshToken: !!safeData.refreshToken
            });

            // Check encryption configuration before attempting decrypt
            if (!this.isEncryptionConfigured()) {
                console.error('Figma credentials: Encryption not configured. Cannot decrypt stored credentials.');
                return {
                    clientId: safeData.clientId,
                    clientSecret: null,
                    hasTokens: !!safeData.accessToken,
                    error: 'Encryption key not configured on server'
                };
            }

            // Safely decrypt client_secret only if it's a valid non-empty string
            let decryptedSecret = null;
            if (safeData.clientSecret && typeof safeData.clientSecret === 'string' && safeData.clientSecret.length > 0) {
                try {
                    decryptedSecret = decrypt(safeData.clientSecret, this.encryptionKey);
                    console.log('Figma credentials: Client secret decrypted successfully');
                } catch (error) {
                    console.error('Failed to decrypt client secret:', error.message);
                    // Return error info instead of silently failing
                    return {
                        clientId: safeData.clientId,
                        clientSecret: null,
                        hasTokens: !!safeData.accessToken,
                        error: `Decryption failed: ${error.message}`
                    };
                }
            }

            return {
                clientId: safeData.clientId,
                clientSecret: decryptedSecret,
                hasTokens: !!safeData.accessToken
            };
        } catch (error) {
            console.error('Error in getCredentials:', error);
            throw error;
        }
    }

    /**
     * Generate OAuth Authorization URL
     * @param {string} userId 
     * @param {string} callbackUrl 
     */
    async generateAuthUrl(userId, callbackUrl) {
        const credentials = await this.getCredentials(userId);
        if (!credentials) {
            throw new Error('Figma App credentials not found. Please set them up first.');
        }

        const state = this.generateState();
        // In a real app, store state in DB/Redis with expiration. 
        // For now, we will return it to the controller to set as a cookie.

        const scope = 'files:read'; // Minimal scope as per security plan

        const url = `https://www.figma.com/oauth?client_id=${credentials.clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${scope}&state=${state}&response_type=code`;

        return { url, state };
    }

    /**
     * Exchange Authorization Code for Tokens
     * @param {string} userId 
     * @param {string} code 
     * @param {string} redirectUri 
     */
    async exchangeCode(userId, code, redirectUri) {
        const credentials = await this.getCredentials(userId);
        if (!credentials) throw new Error('Credentials not found');

        const params = new URLSearchParams();
        params.append('client_id', credentials.clientId);
        params.append('client_secret', credentials.clientSecret);
        params.append('redirect_uri', redirectUri);
        params.append('code', code);
        params.append('grant_type', 'authorization_code');

        const response = await fetch('https://www.figma.com/api/oauth/token', {
            method: 'POST',
            body: params
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Figma OAuth failed: ${text}`);
        }

        const data = await response.json();
        await this.saveTokens(userId, data);
        return true;
    }

    /**
     * Save tokens (encrypted)
     */
    async saveTokens(userId, tokenData) {
        const updates = {
            user_id: userId,
            access_token: tokenData.access_token ? encrypt(tokenData.access_token, this.encryptionKey) : null,
            refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token, this.encryptionKey) : null,
            expires_at: tokenData.expires_in ? new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString() : null,
            scope: tokenData.scope || 'files:read',
            updated_at: new Date().toISOString()
        };

        await this.db.updateFigmaTokens(updates);
    }

    /**
     * Get valid access token (refreshes if needed)
     */
    async getValidAccessToken(userId) {
        try {
            const data = await this.db.getFigmaCredentials(userId);
            if (!data) return null;

            // Handle field name variations (snake_case vs camelCase)
            const accessToken = data.access_token || data.accessToken;
            const expiresAt = data.expires_at || data.expiresAt;
            const refreshToken = data.refresh_token || data.refreshToken;

            if (!accessToken) return null;

            // Check expiration (with 5 minute buffer)
            if (expiresAt) {
                const expiresAtTime = new Date(expiresAt).getTime();
                if (Date.now() + 300000 > expiresAtTime) {
                    // Token expiring soon, refresh it
                    if (refreshToken) {
                        return this.refreshAccessToken(userId, data);
                    } else {
                        return null; // Cannot refresh without refresh token
                    }
                }
            }

            // Decrypt and return access token
            if (typeof accessToken === 'string' && accessToken.length > 0) {
                try {
                    return decrypt(accessToken, this.encryptionKey);
                } catch (decryptError) {
                    console.error('Failed to decrypt access token:', decryptError);
                    return null;
                }
            }
            return null;
        } catch (error) {
            console.error('Error in getValidAccessToken:', error);
            return null;
        }
    }

    /**
     * Refresh Access Token
     * @param {string} userId - User ID
     * @param {Object} [currentData] - Current credential data (optional, will fetch if not provided)
     */
    async refreshAccessToken(userId, currentData = null) {
        // Fetch current data if not provided
        if (!currentData) {
            currentData = await this.db.getFigmaCredentials(userId);
            if (!currentData) {
                throw new Error('No Figma credentials found for user');
            }
        }

        // Handle field name variations
        const refreshTokenField = currentData.refresh_token || currentData.refreshToken;
        const clientSecretField = currentData.client_secret || currentData.clientSecret;

        if (!refreshTokenField || typeof refreshTokenField !== 'string') {
            throw new Error('No refresh token available. Please reconnect to Figma.');
        }

        if (!clientSecretField || typeof clientSecretField !== 'string') {
            throw new Error('Client secret not found. Please reconfigure your Figma App credentials.');
        }

        const clientSecret = decrypt(clientSecretField, this.encryptionKey);
        const refreshToken = decrypt(refreshTokenField, this.encryptionKey);
        const clientId = currentData.client_id || currentData.clientId;

        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('refresh_token', refreshToken);
        params.append('grant_type', 'refresh_token');

        const response = await fetch('https://www.figma.com/api/oauth/refresh', {
            method: 'POST',
            body: params
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Check if refresh token is expired
            if (response.status === 400 || response.status === 401) {
                throw new Error('Refresh token expired. Please reconnect to Figma.');
            }
            throw new Error(`Failed to refresh token: ${errorText}`);
        }

        const newData = await response.json();
        await this.saveTokens(userId, newData);

        return newData.access_token;
    }

    generateState() {
        return crypto.randomBytes(32).toString('hex');
    }
}
