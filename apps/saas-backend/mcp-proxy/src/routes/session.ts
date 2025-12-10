import { Router, Request, Response } from 'express';
import { sessionManager } from '../sessions/SessionManager';

const router = Router();

// POST /mcp/start
router.post('/start', async (req: Request, res: Response) => {
    const { userId, token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }

    // userId is optional, generate one or use provided
    const uid = userId || 'anonymous';

    try {
        const session = await sessionManager.createSession(uid, token);
        res.json({ sessionId: session.id, status: 'connected' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
