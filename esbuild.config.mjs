// Bundles src/ into the one main.js Obsidian loads. Obsidian supplies
// `obsidian` and CodeMirror itself, so they stay out of the bundle: the
// plugin ships nothing but its own code.
import esbuild from 'esbuild';
import { builtinModules } from 'node:module';

const watch = process.argv.includes('--watch');
const ctx = await esbuild.context({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'cjs',
  target: 'es2022',
  outfile: 'main.js',
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtinModules],
  sourcemap: watch ? 'inline' : false,
  minify: false,
  logLevel: 'info',
});
if (watch) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
