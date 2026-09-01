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
