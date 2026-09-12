import { build } from 'esbuild';

await build({
  entryPoints: ['src/handler.ts'],
  outfile: 'dist/handler.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  legalComments: 'none',
});
