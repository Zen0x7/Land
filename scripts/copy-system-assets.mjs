import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectoryPath = dirname(fileURLToPath(import.meta.url));
const projectRootPath = join(currentDirectoryPath, '..');
const sourceDirectoryPath = join(projectRootPath, 'src/system/public');
const targetDirectoryPath = join(projectRootPath, 'dist/system/public');

await mkdir(targetDirectoryPath, { recursive: true });
await cp(sourceDirectoryPath, targetDirectoryPath, { recursive: true });
