// Build helper to temporarily override backend import for TypeScript compilation
const fs = require('fs');
const path = require('path');

// Create temporary override
const serverOverride = `
// Temporary override for build
import { startServer as originalStartServer } from '../../../saas-backend/src/core/server/index.js';
export const startServer = originalStartServer;
`;

fs.writeFileSync(path.join(__dirname, '../src/main/server-override.ts'), serverOverride);
console.log('Created temporary override file');