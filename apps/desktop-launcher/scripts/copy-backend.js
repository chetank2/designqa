/**
 * Copy backend files to launcher app before packaging.
 */

import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const launcherDir = join(__dirname, '..');
const backendDir = join(launcherDir, '../saas-backend');
const targetBackendDir = join(launcherDir, 'saas-backend');

export async function copyBackendFiles() {
  console.log('📦 Copying backend files for launcher...');
  console.log(`Source: ${backendDir}`);
  console.log(`Target: ${targetBackendDir}`);

  if (!existsSync(backendDir)) {
    throw new Error(`Backend directory not found: ${backendDir}`);
  }

  await rm(targetBackendDir, { recursive: true, force: true });
  await mkdir(targetBackendDir, { recursive: true });

  if (existsSync(join(backendDir, 'src'))) {
    await cp(join(backendDir, 'src'), join(targetBackendDir, 'src'), { recursive: true });
    console.log('✅ Copied src directory');
  }

  if (existsSync(join(backendDir, 'package.json'))) {
    await cp(join(backendDir, 'package.json'), join(targetBackendDir, 'package.json'));
    console.log('✅ Copied package.json');

    const packageJsonPath = join(targetBackendDir, 'package.json');
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    let modified = false;

    if (packageJson.dependencies) {
      for (const [depName, depVersion] of Object.entries(packageJson.dependencies)) {
        if (depVersion === 'workspace:*') {
          const packageName = depName.split('/').pop();
          const relativePath = `file:./packages/${packageName}`;
          packageJson.dependencies[depName] = relativePath;
          modified = true;
        }
      }
    }

    if (packageJson.devDependencies) {
      for (const [depName, depVersion] of Object.entries(packageJson.devDependencies)) {
        if (depVersion === 'workspace:*') {
          const packageName = depName.split('/').pop();
          const relativePath = `file:./packages/${packageName}`;
          packageJson.devDependencies[depName] = relativePath;
          modified = true;
        }
      }
    }

    if (packageJson.type !== 'module') {
      packageJson.type = 'module';
      modified = true;
    }

    if (modified) {
      await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
      console.log('✅ Rewrote backend package.json for packaging');
    }
  }

  if (existsSync(join(backendDir, 'config.json'))) {
    await cp(join(backendDir, 'config.json'), join(targetBackendDir, 'config.json'));
    console.log('✅ Copied config.json');
  }

  const frontendDistSource = join(launcherDir, '../saas-frontend/dist');
  const frontendDistTarget = join(targetBackendDir, 'frontend/dist');

  if (existsSync(frontendDistSource)) {
    await mkdir(join(targetBackendDir, 'frontend'), { recursive: true });
    await cp(frontendDistSource, frontendDistTarget, { recursive: true });
    console.log('✅ Copied frontend dist to backend frontend/dist');
  } else {
    console.warn('⚠️ Frontend dist not found, backend may not be able to serve frontend');
  }

  // Copy workspace packages to fix dependency resolution
  const packagesDir = join(launcherDir, '../../packages');
  if (existsSync(packagesDir)) {
    const targetPackagesDir = join(targetBackendDir, 'packages');
    await cp(packagesDir, targetPackagesDir, { recursive: true });
    console.log('✅ Copied workspace packages to backend/packages');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  copyBackendFiles().catch((error) => {
    console.error('❌ Failed to copy backend files:', error);
    process.exit(1);
  });
}
