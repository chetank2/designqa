import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outputFile = join(__dirname, '../dist/main/index.js');
if (!existsSync(outputFile)) {
  console.error(`❌ Build output missing: ${outputFile}`);
  process.exit(1);
}

console.log('✅ TypeScript output present');
