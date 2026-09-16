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
  minNode: '20.9.0',
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
    // `next typegen` first: since 16.3 the scaffolded layout.tsx uses the global
    // LayoutProps helper, which only exists after `next dev`/`build`/`typegen` writes
    // .next/types. Plain `tsc --noEmit` on a fresh clone would fail with TS2304.
    typecheck: 'next typegen && tsc --noEmit',
  },
  skills: [
    {
      source: 'vercel-labs/agent-skills',
      name: 'vercel-react-best-practices',
      by: 'Vercel',
      about:
        'React/Next.js performance rules (waterfalls, bundle size, re-renders, server components). Load before writing or reviewing React code.',
    },
  ],
  tooling: {
    oxlintPlugins: ['react', 'jsx-a11y', 'nextjs'],
    oxlintRules: {
      // Modern JSX transform — React does not need to be in scope.
      'react/react-in-jsx-scope': 'off',
      // Side-effect CSS imports (globals.css) are idiomatic in Next.js.
      'import/no-unassigned-import': 'off',
    },
    gitignore: ['.next/', 'next-env.d.ts'],
    // The one line Next's own managed AGENTS.md block exists to deliver (agentRules is off
    // in next.config.ts so it does not fight the root guide): version-matched docs ship in
    // the package, and agents measurably do better reading them than guessing from memory.
    agentsMd: [
      '- Next.js docs matching the installed version are bundled at `node_modules/next/dist/docs/`.',
      '  Read the relevant guide there before writing Next code — APIs and conventions may differ',
      '  from your training data. `apps/web` has `agentRules: false`; this file is the agent guide.',
    ],
  },
  docker: {
    dev: { args: ['-H', '0.0.0.0'] },
    template: 'next.Dockerfile.tpl',
    containerPort: 3000,
    hostPort: 3000,
    healthPath: '/',
  },
};
