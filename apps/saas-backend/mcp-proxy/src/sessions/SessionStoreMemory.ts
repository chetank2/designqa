import { MCPClient } from '../figma/MCPClient';

export interface Session {
    id: string;
    userId: string;
    token: string;
    client: MCPClient;
    createdAt: number;
    lastUsed: number;
}

export class SessionStoreMemory {
    private sessions: Map<string, Session> = new Map();

    constructor() { }

    set(id: string, session: Session) {
        this.sessions.set(id, session);
    }

    get(id: string): Session | undefined {
        return this.sessions.get(id);
    }

    delete(id: string) {
        this.sessions.delete(id);
    }

    getAll(): Session[] {
        return Array.from(this.sessions.values());
    }
}
