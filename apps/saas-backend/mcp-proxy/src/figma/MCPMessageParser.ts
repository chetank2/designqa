export interface JSONRPCRequest {
    jsonrpc: '2.0';
    method: string;
    params?: any;
    id?: string | number | null;
}

export interface JSONRPCResponse {
    jsonrpc: '2.0';
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
    id: string | number | null;
}

export class MCPMessageParser {
    static parse(data: string): JSONRPCResponse | JSONRPCRequest | null {
        try {
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    static createRequest(method: string, params: any, id?: string | number): JSONRPCRequest {
        return {
            jsonrpc: '2.0',
            method,
            params,
            id: id ?? null, // Notifications have null id, but requests usually need an ID
        };
    }
}
