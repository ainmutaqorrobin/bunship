import { join } from 'node:path';

import { exec } from '../exec';
import { resolvePin } from './shared';
import type { StackAdapter } from './types';

const PIN = 'create-vite@9';

export const reactVite: StackAdapter = {
  id: 'react-vite',
  kind: 'web',
  label: 'React + Vite',
  dirName: 'web',
  devPort: 5173,
  scaffolderPin: PIN,
  minNode: '20.19.0',
  async scaffold(ctx) {
    // create-vite sanitizes absolute Windows paths into a folder NAME — always pass
    // a relative dir with cwd=apps/.
    await exec('bunx', [resolvePin(PIN), 'web', '--template', 'react-ts', '--no-interactive'], {
      cwd: join(ctx.root, 'apps'),
      verbose: ctx.verbose,
    });
  },
  scripts: {
    typecheck: 'tsc -b',
  },
  skills: [
    {
      source: 'vercel-labs/agent-skills',
      name: 'vercel-react-best-practices',
      by: 'Vercel',
      about:
        'React performance rules (bundle size, re-renders, async patterns). Load before writing or reviewing React code; the `server-*` rules are Next.js-only and do not apply here.',
    },
    {
      source: 'vercel-labs/agent-skills',
      name: 'vercel-composition-patterns',
      by: 'Vercel',
      about:
        'React composition patterns (compound components, context, render props) that keep a growing SPA free of prop drilling and boolean-prop sprawl.',
    },
  ],
  tooling: {
    oxlintPlugins: ['react', 'jsx-a11y'],
    oxlintRules: {
      'react/react-in-jsx-scope': 'off',
      'import/no-unassigned-import': 'off',
    },
  },
  docker: {
    // Vite binds 127.0.0.1 by default and reads no HOST env — the flag is the only way.
    dev: { args: ['--host', '0.0.0.0'] },
    template: 'vite-nginx.Dockerfile.tpl',
    containerPort: 80,
    hostPort: 3000,
    healthPath: '/',
  },
};
