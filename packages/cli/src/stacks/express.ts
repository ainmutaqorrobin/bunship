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
  // Nothing credible exists for Express itself (like its scaffolder); the Node.js skill
  // from a Node TSC member covers the layer that matters: async, errors, streams, shutdown.
  skills: [
    {
      source: 'mcollina/skills',
      name: 'node',
      by: 'Matteo Collina (Node.js TSC)',
      about:
        'Node.js + TypeScript best practices: async patterns, error handling, streams, graceful shutdown, testing, logging.',
    },
  ],
  tooling: {},
  docker: {
    template: 'node-api.Dockerfile.tpl',
    containerPort: 3001,
    hostPort: 3001,
    healthPath: '/health',
    vars: { entry: 'dist/index.js' },
  },
};
