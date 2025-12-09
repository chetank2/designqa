import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export class MCPTransport extends EventEmitter {
    private ws: WebSocket | null = null;
    private url: string;
    private token: string;
    private shouldReconnect: boolean = true;
    private reconnectInterval: number = 2000;
    private pingInterval: NodeJS.Timeout | null = null;

    constructor(url: string, token: string) {
        super();
        this.url = url;
        this.token = token;
    }

    public connect() {
        try {
            logger.info(`Connecting to MCP at ${this.url}`);
            this.ws = new WebSocket(this.url, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    // Some MCP servers might need Origin or other headers, but Bearer is key
                    'Origin': 'https://www.figma.com'
                }
            });

            this.ws.on('open', () => {
                logger.info('MCP Transport Connected');
                this.setupPing();
                this.emit('open');
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                this.emit('message', data.toString());
            });

            this.ws.on('error', (err) => {
                logger.error('MCP Transport Error', err);
                this.emit('error', err);
            });

            this.ws.on('close', (code, reason) => {
                logger.warn(`MCP Transport Closed: ${code} - ${reason}`);
                this.clearPing();
                this.emit('close');
                if (this.shouldReconnect) {
                    setTimeout(() => this.connect(), this.reconnectInterval);
                }
            });

        } catch (e) {
            logger.error('Failed to create WebSocket', e);
            if (this.shouldReconnect) {
                setTimeout(() => this.connect(), this.reconnectInterval);
            }
        }
    }

    public send(data: string) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        } else {
            logger.warn('Attempted to send message but socket is not open');
            // Ideally queue messages or throw error? For now, throw to let caller handle retry or failure.
            throw new Error('WebSocket is not open');
        }
    }

    public close() {
        this.shouldReconnect = false;
        this.clearPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private setupPing() {
        this.clearPing();
        this.pingInterval = setInterval(() => {
            // MCP might have its own ping, or we rely on WS ping
            // If we need application level ping:
            // this.send(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }));
        }, 30000); // 30s
    }

    private clearPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
}
