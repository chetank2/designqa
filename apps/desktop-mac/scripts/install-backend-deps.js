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
    const child = spawn(cmd, args, { stdio: 'inherit', cwd });
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

  console.log('📦 Installing backend dependencies...');
  await run('pnpm', ['install', '--prod', '--no-frozen-lockfile'], targetBackendDir);
  console.log('✅ Backend dependencies installed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  installBackendDeps().catch((error) => {
    console.error('❌ Backend dependency install failed:', error);
    process.exit(1);
  });
}
