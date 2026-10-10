// Bundles the UI + engine into dist/app.js (a single IIFE, so index.html also works when opened from disk).
import { build, context } from 'esbuild';

// DR_API_URL: where the co-op server runs (no trailing slash). Unset = a server on this machine, port 8787.
const apiUrl = (process.env.DR_API_URL || 'http://localhost:8787').replace(/\/+$/, '');

const watch = process.argv.includes('--watch');
const opts = {
  entryPoints: ['src/ui/main.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/app.js',
  target: ['es2020'],
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
  define: { __DR_API__: JSON.stringify(apiUrl) },
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('watching src/ ...');
} else {
  await build(opts);
}
