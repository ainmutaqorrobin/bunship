import { join } from 'node:path';

import { exec } from '../exec';
import { copyTemplate } from '../template';
import { resolvePin } from './shared';
import type { StackAdapter } from './types';

const PIN = 'create-next-app@16';

export const next: StackAdapter = {
  id: 'next',
  kind: 'web',
  label: 'Next.js',
  dirName: 'web',
  devPort: 3000,
  scaffolderPin: PIN,
  async scaffold(ctx) {
    // Relative dir + cwd=apps/: some scaffolders mis-handle absolute Windows paths.
    await exec(
      'bunx',
      [
        resolvePin(PIN),
        'web',
        '--ts',
        '--tailwind',
        '--app',
        '--src-dir',
        '--import-alias',
        '@/*',
        '--no-linter',
        '--turbopack',
        '--use-bun',
        '--disable-git',
        '--skip-install',
        '--no-agents-md',
        '--yes',
      ],
      { cwd: join(ctx.root, 'apps'), verbose: ctx.verbose },
    );
  },
  async postProcess(ctx) {
    // Standalone output + monorepo-rooted file tracing (required for the Docker image).
    await copyTemplate('stacks/next/next.config.ts.tpl', join(ctx.appDir, 'next.config.ts'));
  },
  scripts: {
    dev: 'next dev --turbopack',
    build: 'next build',
    start: 'next start',
    typecheck: 'tsc --noEmit',
  },
  tooling: {
    oxlintPlugins: ['react', 'jsx-a11y', 'nextjs'],
    oxlintRules: {
      // Modern JSX transform — React does not need to be in scope.
      'react/react-in-jsx-scope': 'off',
      // Side-effect CSS imports (globals.css) are idiomatic in Next.js.
      'import/no-unassigned-import': 'off',
    },
    gitignore: ['.next/', 'next-env.d.ts'],
  },
  docker: {
    template: 'next.Dockerfile.tpl',
    containerPort: 3000,
    hostPort: 3000,
    healthPath: '/',
  },
};
