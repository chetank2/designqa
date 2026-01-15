import { cp, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const desktopWinDir = join(__dirname, '..');
const sourceDir = join(desktopWinDir, '../saas-frontend/dist');
const targetDir = join(desktopWinDir, 'dist/renderer');

async function copyFrontend() {
  if (!existsSync(sourceDir)) {
    throw new Error(`Frontend build output not found: ${sourceDir}`);
  }

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });

  console.log(`✅ Copied frontend build from ${sourceDir} to ${targetDir}`);
}

copyFrontend().catch((error) => {
  console.error('❌ Failed to copy frontend build:', error);
  process.exit(1);
});
