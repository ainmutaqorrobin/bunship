import { join } from 'node:path';

import { exec } from '../exec';
import { readJson, writeFileLf, writeJson } from '../fsx';
import { resolvePin } from './shared';
import type { StackAdapter } from './types';

// Exact-pinned, not `@8`: 8.0.1 took a Dependabot bump of a whole dependency group
// (fastify/fastify-cli#908) to ESM-only majors while the CJS call sites stayed put, so `require()`
// yields namespace objects instead of callables. Two separate breaks: `generate` dies on
// `colors[level] is not a function` (chalk 6) after writing the files, leaving a bare
// `npm init -y` package.json; `fastify start` dies on `pkgUp is not a function` (pkg-up 5).
// Both are fixed on upstream main but unreleased — drop VERSION back to `8` once >8.0.1 ships.
const VERSION = '8.0.0';
const PIN = `fastify-cli@${VERSION}`;

const HEALTH_ROUTE = `import type { FastifyPluginAsync } from 'fastify';

const health: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get('/health', async () => ({ status: 'ok' }));
};

export default health;
`;

interface FastifyPkg {
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export const fastify: StackAdapter = {
  id: 'fastify',
  kind: 'api',
  label: 'Fastify',
  dirName: 'api',
  devPort: 3001,
  scaffolderPin: PIN,
  async scaffold(ctx) {
    // fastify generate writes files only: no git init, no install.
    await exec('bunx', [resolvePin(PIN), 'generate', 'api', '--lang=ts'], {
      cwd: join(ctx.root, 'apps'),
      verbose: ctx.verbose,
    });
  },
  async postProcess(ctx) {
    // The generated scripts are npm/concurrently-centric; replace them with a
    // bun-friendly, PORT-pinned set (fastify start serves the built dist/app.js).
    const pkgPath = join(ctx.appDir, 'package.json');
    const pkg = await readJson<FastifyPkg>(pkgPath);
    pkg.scripts = {
      ...pkg.scripts,
      dev: 'bun run build && fastify start -w -l info -p 3001 dist/app.js',
      start: 'fastify start -l info -p 3001 -a 0.0.0.0 dist/app.js',
      build: 'tsc',
      typecheck: 'tsc --noEmit',
    };
    // concurrently only served the replaced dev script.
    if (pkg.devDependencies) delete pkg.devDependencies['concurrently'];
    // The template ships `fastify-cli: ^8.0.0`, which floats to the broken 8.0.1 and takes
    // dev/start/Docker down with it (see VERSION above). `bun run check` and `build` stay green
    // either way, so nothing in the generated gate catches this — it has to be pinned here.
    if (pkg.dependencies?.['fastify-cli']) pkg.dependencies['fastify-cli'] = VERSION;
    // Workspace apps are not published; the template's main points at a non-existent path.
    delete pkg.main;
    await writeJson(pkgPath, pkg);
    await writeFileLf(join(ctx.appDir, 'src', 'routes', 'health.ts'), HEALTH_ROUTE);
  },
  scripts: {},
  tooling: {
    oxlintOverrides: [
      {
        // Fastify handlers idiomatically declare (request, reply) without using both.
        files: ['apps/api/**/*.ts'],
        rules: { 'no-unused-vars': ['error', { args: 'none' }] },
      },
    ],
    knipWorkspace: {
      // Plugin/route files are loaded dynamically via @fastify/autoload.
      entry: ['src/app.ts', 'src/plugins/**/*.ts', 'src/routes/**/*.ts', 'test/**/*.ts'],
    },
  },
  docker: {
    dev: { env: { FASTIFY_ADDRESS: '0.0.0.0' } },
    template: 'node-api.Dockerfile.tpl',
    containerPort: 3001,
    hostPort: 3001,
    healthPath: '/health',
    vars: { entry: 'dist/app.js' },
  },
};
