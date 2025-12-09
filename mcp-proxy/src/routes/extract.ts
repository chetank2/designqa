import { Router, Request, Response } from 'express';
import { sessionManager } from '../sessions/SessionManager';

const router = Router();

// POST /mcp/run
router.post('/run', async (req: Request, res: Response) => {
    const { sessionId, method, params } = req.body;

    if (!sessionId || !method) {
        return res.status(400).json({ error: 'Missing sessionId or method' });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        const result = await session.client.sendMessage(method, params);
        res.json({ result });
    } catch (e: any) {
        console.error('MCP Run Error:', e);
        // Handle specific error codes if needed
        res.status(500).json({ error: e.message || 'MCP execution failed' });
    }
});

export default router;
