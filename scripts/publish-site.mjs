// Builds the static site into public/ (the output directory in vercel.json).
// DR_API_URL is the co-op server, e.g. https://deep-regret-coop.onrender.com. Vercel refuses to build without it,
// because the default would send the deployed site to localhost.
// INCLUDE_ASSETS=1 also copies assets/ (the copyrighted artwork, which is not in git). Leave it unset for a public deploy.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'public');

if (process.env.VERCEL && !process.env.DR_API_URL) {
  throw new Error('DR_API_URL is not set. Add the Render server URL in the Vercel project settings.');
}

execFileSync(process.execPath, [join(root, 'build.mjs')], { cwd: root, stdio: 'inherit' });

const parts = ['index.html', 'css', 'dist'];
if (process.env.INCLUDE_ASSETS === '1') parts.push('assets');

rmSync(out, { recursive: true, force: true });
for (const part of parts) {
  const from = join(root, part);
  if (!existsSync(from)) throw new Error(`${part} is missing; cannot build the site`);
  cpSync(from, join(out, part), { recursive: true });
}
console.log(`site written to public/: ${parts.join(', ')}`);
