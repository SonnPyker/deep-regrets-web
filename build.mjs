// Bundles the UI + engine into dist/app.js (a single IIFE, so index.html also works when opened from disk).
import { build, context } from 'esbuild';

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
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('watching src/ ...');
} else {
  await build(opts);
}
