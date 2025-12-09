import { Router, Request, Response } from 'express';
import { sessionManager } from '../sessions/SessionManager';

const router = Router();

// POST /mcp/compare
router.post('/compare', async (req: Request, res: Response) => {
    const { sessionId, nodeId, fileKey } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        // We execute multiple MCP tools to gather full context
        // Assuming standard Figma MCP tool names
        // 1. Get Metadata
        // 2. Get Code
        // 3. Get Variables

        const metadataPromise = session.client.sendMessage('tools/call', {
            name: 'get_metadata',
            arguments: { nodeId }
        });

        const codePromise = session.client.sendMessage('tools/call', {
            name: 'get_code',
            arguments: { nodeId }
        });

        const variablesPromise = session.client.sendMessage('tools/call', {
            name: 'get_variable_defs',
            arguments: { nodeId }
        });

        const [metadata, code, variables] = await Promise.allSettled([
            metadataPromise,
            codePromise,
            variablesPromise
        ]);

        // Parse results
        const result = {
            metadata: metadata.status === 'fulfilled' ? metadata.value : { error: metadata.reason },
            code: code.status === 'fulfilled' ? code.value : { error: code.reason },
            variables: variables.status === 'fulfilled' ? variables.value : { error: variables.reason },
            timestamp: new Date().toISOString()
        };

        res.json(result);

    } catch (e: any) {
        console.error('MCP Compare Error:', e);
        res.status(500).json({ error: e.message || 'Comparison failed' });
    }
});

export default router;
