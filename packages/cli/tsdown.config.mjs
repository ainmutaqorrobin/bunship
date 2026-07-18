import { defineConfig } from 'tsdown';

// Plain .mjs on purpose: a .ts config would require tsdown's optional `unrun` loader,
// which Bun's isolated linker does not expose.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node20',
  dts: false,
  minify: false,
  // Bundle every dependency: the published package has zero runtime deps.
  deps: { alwaysBundle: [/.*/] },
});
