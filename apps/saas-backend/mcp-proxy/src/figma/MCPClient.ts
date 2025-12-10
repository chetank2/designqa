import { MCPTransport } from './MCPTransport';
import { MCPMessageParser, JSONRPCRequest, JSONRPCResponse } from './MCPMessageParser';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { ENV } from '../config/env';

export class MCPClient {
    private transport: MCPTransport;
    private pendingRequests = new Map<string | number, { resolve: (val: any) => void; reject: (err: any) => void }>();
    private isConnected: boolean = false;
    private connectionTimeoutMs = 15000;

    constructor(token: string, url: string = ENV.FIGMA_MCP_URL) {
        this.transport = new MCPTransport(url, token);

        this.transport.on('open', () => {
            this.isConnected = true;
            logger.info('MCPClient: Connected');
        });

        this.transport.on('close', () => {
            this.isConnected = false;
            logger.warn('MCPClient: Disconnected');
            // Reject all pending requests
            this.pendingRequests.forEach((handler, key) => {
                handler.reject(new Error('Connection closed'));
                this.pendingRequests.delete(key);
            });
        });

        this.transport.on('error', (err) => {
            logger.error('MCPClient: Transport Error', err);
        });

        this.transport.on('message', (data: string) => {
            this.handleMessage(data);
        });
    }

    public async connect() {
        if (this.isConnected) {
            return;
        }
        const waitPromise = this.waitForConnection();
        this.transport.connect();
        await waitPromise;
    }

    public close() {
        this.transport.close();
    }

    public async sendMessage(method: string, params?: any): Promise<any> {
        if (!this.isConnected) {
            await this.waitForConnection();
        }

        const id = uuidv4();
        const request = MCPMessageParser.createRequest(method, params, id);

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });

            try {
                this.transport.send(JSON.stringify(request));
            } catch (e) {
                this.pendingRequests.delete(id);
                reject(e);
            }

            // Timeout
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000); // 30s timeout
        });
    }

    private waitForConnection(timeout: number = this.connectionTimeoutMs): Promise<void> {
        if (this.isConnected) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            let settled = false;
            const handleOpen = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };
            const handleError = (err: Error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(err);
            };
            const handleClose = () => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error('Connection closed before establishing WebSocket'));
            };
            const cleanup = () => {
                this.transport.removeListener('open', handleOpen);
                this.transport.removeListener('error', handleError);
                this.transport.removeListener('close', handleClose);
                clearTimeout(timer);
            };

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error('Timed out waiting for MCP connection'));
            }, timeout);

            this.transport.once('open', handleOpen);
            this.transport.once('error', handleError);
            this.transport.once('close', handleClose);
        });
    }

    private handleMessage(data: string) {
        const message = MCPMessageParser.parse(data);
        if (!message) return;

        // Is it a response?
        if ('result' in message || 'error' in message) {
            const response = message as JSONRPCResponse;
            if (response.id && this.pendingRequests.has(response.id)) {
                const { resolve, reject } = this.pendingRequests.get(response.id)!;
                this.pendingRequests.delete(response.id);

                if (response.error) {
                    reject(response.error);
                } else {
                    resolve(response.result);
                }
            }
        } else {
            // Notification or Request from Server
            logger.debug('Received notification/request from MCP', message);
            // Handle server-side requests (e.g. ping?)
        }
    }
}
