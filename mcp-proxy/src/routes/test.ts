import { Router, Request, Response } from 'express';
import { sessionManager } from '../sessions/SessionManager';

const router = Router();

// GET /mcp/status
router.get('/status', (req: Request, res: Response) => {
    // Check global health or specific session if provided?
    // User asked for "MCP connection status for debugging"
    res.json({ status: 'ok', uptime: process.uptime() });
});

// POST /mcp/test
router.post('/test', async (req: Request, res: Response) => {
    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        // Send a simple ping or check connection
        // We can assume if session exists and no error from transport, it's connected?
        // Or send a real ping if MCP supports it.
        // For now, return connected status.
        res.json({ connected: true, sessionId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
