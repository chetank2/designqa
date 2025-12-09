# Remote MCP Proxy Server

This service proxies requests between the DesignQA SaaS Backend and Figma's MCP WebSocket interface.

## Deployment

Deployed on Render as a Web Service.
Base URL: `https://mcp-proxy.onrender.com` (Example)

## Environment Variables

- `FIGMA_MCP_URL`: WebSocket URL for Figma MCP (default: `wss://mcp.figma.com/transports/websocket`)
- `FIGMA_CLIENT_ID`: OAuth Client ID
- `FIGMA_CLIENT_SECRET`: OAuth Client Secret
- `FIGMA_PAT`: Fallback Personal Access Token
- `PORT`: Service port

## API Endpoints

All endpoints are prefixed with `/mcp`.

### 1. Start Session
Initialize a connection to Figma MCP.

- **URL**: `POST /mcp/start`
- **Body**:
  ```json
  {
    "userId": "user_123",
    "token": "figma_oauth_token_or_pat"
  }
  ```
- **Response**:
  ```json
  {
    "sessionId": "uuid-session-id",
    "status": "connected"
  }
  ```

### 2. Check Connection (Test)
Verify the server and session status.

- **URL**: `POST /mcp/test`
- **Body**:
  ```json
  {
    "sessionId": "uuid-session-id"
  }
  ```
- **Response**:
  ```json
  {
    "connected": true,
    "sessionId": "uuid-session-id"
  }
  ```

### 3. Run Generic MCP Command
Execute a specific MCP tool or method.

- **URL**: `POST /mcp/run`
- **Body**:
  ```json
  {
    "sessionId": "uuid-session-id",
    "method": "tools/call",
    "params": {
      "name": "get_design_context",
      "arguments": { "nodeId": "1:2" }
    }
  }
  ```
- **Response**:
  ```json
  {
    "result": { ... }
  }
  ```

### 4. Run Comparison Extraction
Extracts all necessary data (Metadata, Code, Variables) for a node to perform a comparison.

- **URL**: `POST /mcp/compare`
- **Body**:
  ```json
  {
    "sessionId": "uuid-session-id",
    "nodeId": "1:2",
    "fileKey": "optional_file_key"
  }
  ```
- **Response**:
  ```json
  {
    "metadata": { ... },
    "code": { ... },
    "variables": { ... },
    "timestamp": "2023-..."
  }
  ```

### 5. Service Status
Get the health/uptme of the proxy service itself.

- **URL**: `GET /mcp/status`
- **Response**:
  ```json
  {
    "status": "ok",
    "uptime": 123.45
  }
  ```

## Example Workflow

1. User logs in to SaaS App (Frontend).
2. Frontend obtains Figma OAuth Token.
3. Frontend sends Token to Backend.
4. Backend calls `POST /mcp/start` with Token -> Gets `sessionId`.
5. Backend calls `POST /mcp/compare` with `sessionId` and `nodeId` -> Gets design data.
6. Backend compares design data with implementation.
7. Backend returns results to Frontend.
