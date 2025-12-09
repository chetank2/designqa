import { MCPTransport } from './MCPTransport';
import { MCPMessageParser, JSONRPCRequest, JSONRPCResponse } from './MCPMessageParser';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { ENV } from '../config/env';

export class MCPClient {
    private transport: MCPTransport;
    private pendingRequests = new Map<string | number, { resolve: (val: any) => void; reject: (err: any) => void }>();
    private isConnected: boolean = false;

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

    public connect() {
        this.transport.connect();
    }

    public close() {
        this.transport.close();
    }

    public async sendMessage(method: string, params?: any): Promise<any> {
        if (!this.isConnected) {
            // Ideally wait for connection or throw
            // For now, throw
            // throw new Error('Not connected to MCP');
            // Or maybe wait a bit?
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
