import { join } from 'node:path';

import { exec } from '../exec';
import { readJson, writeJson } from '../fsx';
import { copyTemplate } from '../template';
import type { StackAdapter } from './types';

const PIN = 'create-hono@0.19';

export const hono: StackAdapter = {
  id: 'hono',
  kind: 'api',
  label: 'Hono',
  dirName: 'api',
  devPort: 3001,
  scaffolderPin: PIN,
  async scaffold(ctx) {
    // --install is required for non-interactive use: without it create-hono prompts
    // ("install dependencies?") and, with closed stdin, exits 0 leaving an EMPTY dir.
    // The universal cleanup removes the app-level node_modules/bun.lock it produces.
    await exec('bunx', [PIN, 'api', '--template', 'bun', '--pm', 'bun', '--install'], {
      cwd: join(ctx.root, 'apps'),
      verbose: ctx.verbose,
    });
  },
  async postProcess(ctx) {
    // PORT-aware entry with a /health route (template hardcodes nothing useful here).
    await copyTemplate('stacks/hono/index.ts', join(ctx.appDir, 'src', 'index.ts'));
    // The template omits skipLibCheck, surfacing bun-types/@types/node lib clashes.
    const tsconfigPath = join(ctx.appDir, 'tsconfig.json');
    const tsconfig = await readJson<{ compilerOptions?: Record<string, unknown> }>(tsconfigPath);
    tsconfig.compilerOptions = { ...tsconfig.compilerOptions, skipLibCheck: true };
    await writeJson(tsconfigPath, tsconfig);
  },
  scripts: {
    start: 'bun src/index.ts',
    typecheck: 'tsc --noEmit',
  },
  tooling: {},
  docker: {
    template: 'bun-api.Dockerfile.tpl',
    containerPort: 3001,
    hostPort: 3001,
    healthPath: '/health',
  },
};
