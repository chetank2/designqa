import { Session, SessionStoreMemory } from './SessionStoreMemory';
import { RemoteMCPClient } from '../figma/RemoteMCPClient';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export class SessionManager {
    private store: SessionStoreMemory;
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        this.store = new SessionStoreMemory();
        this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 60 * 1000); // 1 hour
    }

    public async createSession(userId: string, token: string): Promise<Session> {
        // Check if session exists for user? For now, allow multiple or just new one.
        // Ideally we might reuse if token matches?
        // Let's create new for now.

        const id = uuidv4();
        const client = new RemoteMCPClient(token);
        await client.connect();

        const session: Session = {
            id,
            userId,
            token,
            client,
            createdAt: Date.now(),
            lastUsed: Date.now()
        };

        this.store.set(id, session);
        logger.info(`Session created for user ${userId}`, { sessionId: id });
        return session;
    }

    public getSession(id: string): Session | undefined {
        const session = this.store.get(id);
        if (session) {
            session.lastUsed = Date.now();
        }
        return session;
    }

    public removeSession(id: string) {
        const session = this.store.get(id);
        if (session) {
            session.client.close();
            this.store.delete(id);
            logger.info(`Session removed`, { sessionId: id });
        }
    }

    private cleanup() {
        const now = Date.now();
        const sessions = this.store.getAll();
        sessions.forEach(session => {
            if (now - session.lastUsed > 24 * 60 * 60 * 1000) { // 24 hours idle
                this.removeSession(session.id);
            }
        });
    }
}

export const sessionManager = new SessionManager();
