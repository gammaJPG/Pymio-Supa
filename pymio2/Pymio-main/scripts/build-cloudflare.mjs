import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, '.cloudflare-public');
const publicRootExtensions = new Set(['.html', '.js', '.css', '.png', '.jpeg', '.webmanifest']);
const publicAssetExtensions = new Set(['.png', '.jpeg']);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && publicRootExtensions.has(extname(entry.name))) {
    await cp(join(root, entry.name), join(output, entry.name));
  }
}

const sourceAssets = join(root, 'assets');
const outputAssets = join(output, 'assets');
await mkdir(outputAssets, { recursive: true });
for (const entry of await readdir(sourceAssets, { withFileTypes: true })) {
  if (entry.isFile() && publicAssetExtensions.has(extname(entry.name))) {
    await cp(join(sourceAssets, entry.name), join(outputAssets, entry.name));
  }
}

console.log('Archivos públicos de Pymio preparados para Cloudflare.');
