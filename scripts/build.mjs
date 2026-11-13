import { build } from 'esbuild';

await Promise.all([
  build({ entryPoints: ['src/diff.ts'], outfile: 'build/diff.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node20' }),
  build({ entryPoints: ['src/extension.ts'], outfile: 'build/extension.js', bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], target: 'node20' }),
  build({ entryPoints: ['web/editor.ts'], outfile: 'build/web.js', bundle: true, platform: 'browser', format: 'iife', target: 'es2022' })
]);
