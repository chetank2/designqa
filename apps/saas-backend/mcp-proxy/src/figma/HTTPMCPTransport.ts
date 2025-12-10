import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * HTTP/HTTPS MCP Transport
 * Uses fetch-based requests instead of WebSocket for Figma's remote MCP
 */
export class HTTPMCPTransport extends EventEmitter {
    private url: string;
    private token: string;
    private sessionId: string | null = null;
    private messageId: number = 0;
    private isConnected: boolean = false;

    constructor(url: string, token: string) {
        super();
        this.url = url;
        this.token = token;
    }

    public async connect() {
        try {
            logger.info(`Connecting to MCP at ${this.url} via HTTP`);

            // Step 1: Initialize with authentication
            const initResponse = await fetch(this.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: ++this.messageId,
                    method: "initialize",
                    params: {
                        protocolVersion: "2024-11-05",
                        capabilities: {
                            tools: {},
                            resources: { subscribe: true }
                        },
                        clientInfo: {
                            name: "mcp-proxy",
                            version: "1.0.0"
                        }
                    }
                })
            });

            if (!initResponse.ok) {
                const errorText = await initResponse.text();
                throw new Error(`Initialize failed: ${initResponse.status} - ${errorText}`);
            }

            // Get session ID from headers
            this.sessionId = initResponse.headers.get('mcp-session-id');
            if (!this.sessionId) {
                this.sessionId = `http_${Date.now()}`;
            }

            // Consume the initialize response
            await initResponse.text();

            // Step 2: Send initialized notification
            try {
                const notifyResponse = await fetch(this.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json, text/event-stream',
                        'Authorization': `Bearer ${this.token}`,
                        ...(this.sessionId && { 'mcp-session-id': this.sessionId })
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "notifications/initialized",
                        params: {}
                    })
                });

                if (notifyResponse.ok) {
                    await notifyResponse.text();
                }
            } catch (notifyError) {
                logger.warn('Initialized notification failed, but continuing...', notifyError);
            }

            this.isConnected = true;
            logger.info('HTTP MCP Transport Connected');
            this.emit('open');

        } catch (e) {
            logger.error('Failed to connect via HTTP', e);
            this.emit('error', e);
            throw e;
        }
    }

    public async send(data: string): Promise<string> {
        if (!this.isConnected || !this.sessionId) {
            throw new Error('Not connected to MCP');
        }

        try {
            const request = JSON.parse(data);
            
            const response = await fetch(this.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream',
                    'Authorization': `Bearer ${this.token}`,
                    'mcp-session-id': this.sessionId
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`MCP request failed: ${response.status} - ${errorText}`);
            }

            const responseText = await response.text();
            
            // Emit message event for compatibility
            this.emit('message', responseText);
            
            return responseText;
        } catch (e) {
            logger.error('Failed to send message via HTTP', e);
            throw e;
        }
    }

    public close() {
        this.isConnected = false;
        this.sessionId = null;
        logger.info('HTTP MCP Transport Closed');
        this.emit('close');
    }

    public getSessionId(): string | null {
        return this.sessionId;
    }
}
