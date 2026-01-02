import { cp, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const desktopMacDir = join(__dirname, '..');
const sourceDir = join(desktopMacDir, '../saas-frontend/dist');
const targetDir = join(desktopMacDir, 'dist/renderer');

if (!existsSync(sourceDir)) {
  console.warn(`⚠️ Frontend dist not found at ${sourceDir}`);
  process.exit(0);
}

await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
console.log(`✅ Copied frontend dist to ${targetDir}`);
