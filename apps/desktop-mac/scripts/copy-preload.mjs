import { cp, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const desktopMacDir = join(__dirname, '..');
const sourceDir = join(desktopMacDir, 'src/preload');
const targetDir = join(desktopMacDir, 'dist/preload');

if (!existsSync(sourceDir)) {
  console.warn(`⚠️ Preload source not found at ${sourceDir}`);
  process.exit(0);
}

await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
console.log(`✅ Copied preload scripts to ${targetDir}`);
