import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const desktopMacDir = join(__dirname, '..');
const targetBackendDir = join(desktopMacDir, 'saas-backend');

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    // Set CI=true to prevent pnpm from asking for TTY confirmation
    const env = { ...process.env, CI: 'true' };
    const child = spawn(cmd, args, { stdio: 'inherit', cwd, env });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}`));
      }
    });
  });
}

async function installBackendDeps() {
  if (!existsSync(targetBackendDir)) {
    throw new Error(`Backend directory not found: ${targetBackendDir}`);
  }

  console.log('📦 Installing backend dependencies (using npm for production bundling)...');
  // Use npm instead of pnpm to avoid workspace hoisting/symlink issues in the Electron package.
  // This ensures a clean, physical node_modules directory is created within the backend folder.
  await run('npm', ['install', '--omit=dev', '--ignore-scripts'], targetBackendDir);
  console.log('✅ Backend dependencies installed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  installBackendDeps().catch((error) => {
    console.error('❌ Backend dependency install failed:', error);
    process.exit(1);
  });
}
