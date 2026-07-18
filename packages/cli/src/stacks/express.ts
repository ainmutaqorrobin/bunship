import { copyTemplateDir } from '../template';
import type { StackAdapter } from './types';

// The one stack without an official scaffolder — backed by our internal template.
export const express: StackAdapter = {
  id: 'express',
  kind: 'api',
  label: 'Express',
  dirName: 'api',
  devPort: 3001,
  scaffolderPin: null,
  async scaffold(ctx) {
    await copyTemplateDir('stacks/express', ctx.appDir, { pkgName: ctx.pkgName });
  },
  scripts: {},
  tooling: {
    knipWorkspace: { entry: ['src/index.ts'] },
  },
  docker: {
    template: 'node-api.Dockerfile.tpl',
    containerPort: 3001,
    hostPort: 3001,
    healthPath: '/health',
    vars: { entry: 'dist/index.js' },
  },
};
