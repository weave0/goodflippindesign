import { registerHooks } from 'node:module';
// Bundlers (wrangler/esbuild) accept `import x from './f.json'`; plain Node needs `with { type: 'json' }`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (result.url.endsWith('.json')) return { ...result, importAttributes: { type: 'json' } };
    return result;
  },
});
