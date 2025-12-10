import { ENV } from '../config/env';
import { logger } from '../utils/logger';

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: number;
    method: string;
    params?: Record<string, unknown> | null;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id?: number;
    result?: any;
    error?: {
        code?: number;
        message: string;
        data?: unknown;
    };
}

export class RemoteMCPClient {
    private baseUrl: string;
    private token: string;
    private sessionId: string | null = null;
    private initialized = false;
    private messageId = 0;

    constructor(token: string, baseUrl: string = ENV.FIGMA_MCP_URL || 'https://mcp.figma.com/mcp') {
        this.token = token;
        this.baseUrl = baseUrl;
    }

    public async connect(): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (!this.token) {
            throw new Error('Figma token required for remote MCP connection');
        }

        logger.info(`Connecting to remote Figma MCP at ${this.baseUrl}`);

        const initRequest: JsonRpcRequest = {
            jsonrpc: '2.0',
            id: ++this.messageId,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {},
                    resources: { subscribe: true }
                },
                clientInfo: {
                    name: 'designqa-proxy',
                    version: '1.0.0'
                }
            }
        };

        const initResponse = await fetch(this.baseUrl, {
            method: 'POST',
            headers: this.buildHeaders(false),
            body: JSON.stringify(initRequest)
        });

        if (!initResponse.ok) {
            const errorText = await initResponse.text();
            throw new Error(`Initialize failed: ${initResponse.status} - ${errorText}`);
        }

        this.sessionId = initResponse.headers.get('mcp-session-id') || `remote_${Date.now()}`;
        logger.info(`Remote MCP session established: ${this.sessionId}`);

        await initResponse.text();

        await this.sendNotification('notifications/initialized');

        this.initialized = true;
        logger.info('Remote MCP client initialized successfully');

        try {
            const tools = await this.sendMessage('tools/list');
            logger.info('Remote MCP tools available', { tools: tools?.tools?.map((tool: any) => tool.name) || [] });
        } catch (error: any) {
            logger.warn(`Unable to list tools: ${error.message}`);
        }
    }

    public close(): void {
        this.initialized = false;
        this.sessionId = null;
    }

    public async sendMessage(method: string, params?: Record<string, unknown>): Promise<any> {
        if (!this.initialized) {
            await this.connect();
        }

        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id: ++this.messageId,
            method,
            params
        };

        const response = await this.sendRequest(request);
        if (response.error) {
            throw new Error(response.error.message || 'Remote MCP error');
        }
        return response.result;
    }

    private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            method,
            params
        };

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: this.buildHeaders(true),
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.warn(`Notification ${method} failed: ${response.status} - ${errorText}`);
        } else {
            await response.text();
        }
    }

    private async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: this.buildHeaders(true),
            body: JSON.stringify(request)
        });

        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        return this.parseSSEResponse(responseText);
    }

    private buildHeaders(includeSession: boolean): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': `Bearer ${this.token}`
        };

        if (includeSession && this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
        }

        return headers;
    }

    private parseSSEResponse(text: string): JsonRpcResponse {
        const trimmed = text.trim();
        if (trimmed.startsWith('{')) {
            return JSON.parse(trimmed);
        }

        const lines = text.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const payload = line.substring(6).trim();
                if (payload) {
                    return JSON.parse(payload);
                }
            }
        }

        throw new Error('Unable to parse MCP response');
    }
}
