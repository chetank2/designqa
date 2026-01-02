import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = join(__dirname, '../../..');
const requiredPaths = [
  join(rootDir, 'packages/mcp-client/dist'),
  join(rootDir, 'packages/compare-engine/dist')
];

const missing = requiredPaths.filter((p) => !existsSync(p));

if (missing.length > 0) {
  console.error('❌ Missing build outputs:', missing.join(', '));
  process.exit(1);
}

console.log('✅ Workspace package builds verified');
