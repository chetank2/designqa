import express from 'express';
import { getServices } from '../database/init.js';

const router = express.Router();

// Helper to get service
function getAuthService() {
    const services = getServices();
    return services.figmaAuth;
}

/**
 * POST /api/auth/figma/setup
 * Save user's Figma Client ID and Secret (BYO-App)
 */
router.post('/figma/setup', async (req, res) => {
    try {
        const { clientId, clientSecret } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        if (!clientId || !clientSecret) {
            return res.status(400).json({ success: false, error: 'Client ID and Secret are required' });
        }

        // Input validation: Basic check to prevent obviously bad input
        if (clientId.length > 100 || clientSecret.length > 200) {
            return res.status(400).json({ success: false, error: 'Invalid credentials format' });
        }

        await getAuthService().saveCredentials(userId, clientId, clientSecret);

        res.json({ success: true, message: 'Credentials saved successfully' });
    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/auth/figma/connect
 * Initiate OAuth flow
 */
router.get('/figma/connect', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        // Construct callback URL based on referer/host
        // In production, this should be pre-determined
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const callbackUrl = `${protocol}://${host}/api/auth/figma/callback`;

        const { url, state } = await getAuthService().generateAuthUrl(userId, callbackUrl);

        // Set state cookie (secure, httpOnly)
        res.cookie('figma_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 10, // 10 minutes
            sameSite: 'lax' // lax is often better for redirects
        });

        res.json({ success: true, url });
    } catch (error) {
        console.error('Connect error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/auth/figma/callback
 * Handle OAuth callback from Figma
 */
router.get('/figma/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;
        const userId = req.user?.id;
        const storedState = req.cookies?.figma_oauth_state;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'User session missing' });
        }

        if (error) {
            return res.status(400).json({ success: false, error: `Figma error: ${error}` });
        }

        // CSRF Protection
        if (!state || state !== storedState) {
            console.error('CSRF mismatch', { received: state, stored: storedState });
            return res.status(403).json({ success: false, error: 'Invalid state parameter (CSRF detected)' });
        }

        // Clear state cookie
        res.clearCookie('figma_oauth_state');

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const callbackUrl = `${protocol}://${host}/api/auth/figma/callback`;

        await getAuthService().exchangeCode(userId, code, callbackUrl);

        // Redirect to frontend (success page or settings)
        // Assuming frontend allows control via query param or default
        res.redirect('/settings?figma_connected=true');

    } catch (error) {
        console.error('Callback error:', error);
        res.redirect(`/settings?figma_error=${encodeURIComponent(error.message)}`);
    }
});

/**
 * GET /api/auth/figma/status
 * Check connection status
 */
router.get('/figma/status', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.json({ success: false, connected: false });

        const creds = await getAuthService().getCredentials(userId);

        res.json({
            success: true,
            hasCredentials: !!creds,
            connected: !!creds?.hasTokens
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
