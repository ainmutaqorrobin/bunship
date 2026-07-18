import { join } from 'node:path';

import { exec } from '../exec';
import type { StackAdapter } from './types';

const PIN = 'create-vite@9';

export const reactVite: StackAdapter = {
  id: 'react-vite',
  kind: 'web',
  label: 'React + Vite',
  dirName: 'web',
  devPort: 5173,
  scaffolderPin: PIN,
  async scaffold(ctx) {
    // create-vite sanitizes absolute Windows paths into a folder NAME — always pass
    // a relative dir with cwd=apps/.
    await exec('bunx', [PIN, 'web', '--template', 'react-ts', '--no-interactive'], {
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
    template: 'vite-nginx.Dockerfile.tpl',
    containerPort: 80,
    hostPort: 3000,
    healthPath: '/',
  },
};
