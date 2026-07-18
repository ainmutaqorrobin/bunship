import { join } from 'node:path';

import { exec } from '../exec';
import { writeFileLf } from '../fsx';
import { resolvePin } from './shared';
import type { StackAdapter } from './types';

const PIN = 'create-expo-app@4';

const CSS_SHIM = `// The Expo template imports CSS (web support); plain \`tsc --noEmit\` needs these shims.
declare module '*.module.css' {
  const styles: Record<string, string>;
  export default styles;
}
declare module '*.css';
`;

export const expo: StackAdapter = {
  id: 'expo',
  kind: 'mobile',
  label: 'Expo',
  dirName: 'mobile',
  devPort: 8081,
  scaffolderPin: PIN,
  async scaffold(ctx) {
    // NOTE: create-expo-app has no skip-git flag; the universal cleanup deletes the
    // nested .git it always creates.
    await exec(
      'bunx',
      [
        resolvePin(PIN),
        'mobile',
        '--template',
        'default',
        '--yes',
        '--no-install',
        '--no-agents-md',
      ],
      { cwd: join(ctx.root, 'apps'), verbose: ctx.verbose },
    );
  },
  async postProcess(ctx) {
    await writeFileLf(join(ctx.appDir, 'css.d.ts'), CSS_SHIM);
  },
  scripts: {
    dev: 'expo start',
    build: 'expo export --platform web',
    typecheck: 'tsc --noEmit',
  },
  tooling: {
    oxlintPlugins: ['react', 'jsx-a11y'],
    oxlintRules: {
      'react/react-in-jsx-scope': 'off',
      'import/no-unassigned-import': 'off',
    },
    oxlintOverrides: [
      {
        // The upstream template forwards props selectively (unused destructured params).
        files: ['apps/mobile/**/*.{ts,tsx}'],
        rules: { 'no-unused-vars': ['error', { args: 'none' }] },
      },
    ],
    gitignore: ['.expo/'],
    hoistedLinker: true,
    knipWorkspace: {
      // Template deps referenced from native config / kept for parity with upstream,
      // plus expo-updates which app.json mentions without listing as a dependency.
      ignoreDependencies: ['@expo/ui', 'expo-glass-effect', 'expo-status-bar', 'expo-updates'],
    },
  },
  // No container — mobile apps ship via EAS, not the VPS pipeline.
};
