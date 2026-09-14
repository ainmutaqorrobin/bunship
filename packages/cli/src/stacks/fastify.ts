import { join } from 'node:path';

import { exec } from '../exec';
import { pathExists, readJson, writeFileLf, writeJson } from '../fsx';
import { resolvePin } from './shared';
import type { StackAdapter } from './types';

// 8.0.1 is unusable (fastify/fastify-cli#908 bumped chalk/pkg-up to ESM-only majors under CJS
// call sites: `generate` dies on `colors[level] is not a function`, `fastify start` on `pkgUp is
// not a function`). 8.0.2 fixed both, so the major pin is safe again — but the generated app's
// `fastify-cli` dependency below gets an explicit floor so a resolver can never land on 8.0.1.
const PIN = 'fastify-cli@8';
const FLOOR = '^8.0.2';

const HEALTH_ROUTE = `import type { FastifyPluginAsync } from 'fastify';

const health: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get('/health', async () => ({ status: 'ok' }));
};

export default health;
`;

interface Tsconfig {
  compilerOptions?: Record<string, unknown>;
}

// fastify-cli 8.0.2 bumped the template's `typescript` to ~6.0 without touching the tsconfigs.
// TS 6 no longer infers `rootDir` (TS5011 on `tsc`, so `build`/`typecheck` fail outright), no
// longer auto-includes `@types/*` (ts-node then can't see `node:test`), and errors on the
// deprecated `baseUrl` the test tsconfig sets (TS5101). All four patches are no-ops under TS 5.
async function patchTsconfigsForTs6(appDir: string): Promise<void> {
  const appPath = join(appDir, 'tsconfig.json');
  const app = await readJson<Tsconfig>(appPath);
  app.compilerOptions = { ...app.compilerOptions, rootDir: 'src', types: ['node'] };
  await writeJson(appPath, app);

  // test/tsconfig.json extends the app one and includes ../src, so it needs its own rootDir.
  const testPath = join(appDir, 'test', 'tsconfig.json');
  if (!(await pathExists(testPath))) return;
  const test = await readJson<Tsconfig>(testPath);
  const { baseUrl: _baseUrl, ...rest } = test.compilerOptions ?? {};
  test.compilerOptions = { ...rest, rootDir: '..' };
  await writeJson(testPath, test);
}

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
    // Older templates ship `fastify-cli: ^8.0.0`, which can resolve to the broken 8.0.1 and take
    // dev/start/Docker down with it (see PIN above). `bun run check` and `build` stay green
    // either way, so nothing in the generated gate catches this — it has to be floored here.
    if (pkg.dependencies?.['fastify-cli']) pkg.dependencies['fastify-cli'] = FLOOR;
    // Workspace apps are not published; the template's main points at a non-existent path.
    delete pkg.main;
    await writeJson(pkgPath, pkg);
    await patchTsconfigsForTs6(ctx.appDir);
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
