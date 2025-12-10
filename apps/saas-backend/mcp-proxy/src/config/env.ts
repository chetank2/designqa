import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
    PORT: process.env.PORT || 3001,
    NODE_ENV: process.env.NODE_ENV || 'development',
    FIGMA_MCP_URL: process.env.FIGMA_MCP_URL || 'https://mcp.figma.com/mcp',
    FIGMA_CLIENT_ID: process.env.FIGMA_CLIENT_ID,
    FIGMA_CLIENT_SECRET: process.env.FIGMA_CLIENT_SECRET,
    // Fallback PAT if no user token provided (optional usage, but good to have)
    FIGMA_PAT: process.env.FIGMA_PAT,
};

export const isDev = ENV.NODE_ENV === 'development';
