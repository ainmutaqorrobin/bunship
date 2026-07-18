import { join } from 'node:path';

import { exec } from '../exec';
import { ensureDir, readJson, writeFileLf, writeJson } from '../fsx';
import { patchFileOrWarn } from './shared';
import type { StackAdapter } from './types';

const PIN = '@nestjs/cli@11';

const HEALTH_CONTROLLER = `import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
`;

export const nest: StackAdapter = {
  id: 'nest',
  kind: 'api',
  label: 'NestJS',
  dirName: 'api',
  devPort: 3001,
  scaffolderPin: PIN,
  async scaffold(ctx) {
    // `nest new` has no --directory flag: the name positional doubles as the target dir,
    // so run it inside apps/. Bun is not an accepted --package-manager value (nest-cli#2223);
    // --skip-install + the root `bun install` covers dependencies anyway.
    await ensureDir(join(ctx.root, 'apps'));
    await exec(
      'bunx',
      [
        PIN,
        'new',
        ctx.appDir.split(/[\\/]/).pop() ?? 'api',
        '--skip-git',
        '--skip-install',
        '--package-manager',
        'npm',
        '--language',
        'ts',
        '--strict',
      ],
      { cwd: join(ctx.root, 'apps'), verbose: ctx.verbose },
    );
  },
  async postProcess(ctx) {
    // Monorepo convention: app-level `start` is the PRODUCTION start (the Docker CMD
    // runs `node --run start`); the template's `nest start` needs the dev-only CLI.
    const pkgPath = join(ctx.appDir, 'package.json');
    const pkg = await readJson<{ scripts?: Record<string, string> }>(pkgPath);
    pkg.scripts = { ...pkg.scripts, start: 'node dist/main.js' };
    await writeJson(pkgPath, pkg);

    await patchFileOrWarn(
      ctx,
      'src/main.ts',
      'process.env.PORT ?? 3000',
      'process.env.PORT ?? 3001',
      'set the API port to 3001',
    );
    await writeFileLf(join(ctx.appDir, 'src', 'health.controller.ts'), HEALTH_CONTROLLER);
    await patchFileOrWarn(
      ctx,
      'src/app.module.ts',
      "import { AppController } from './app.controller';",
      "import { AppController } from './app.controller';\nimport { HealthController } from './health.controller';",
      'import HealthController',
    );
    await patchFileOrWarn(
      ctx,
      'src/app.module.ts',
      'controllers: [AppController]',
      'controllers: [AppController, HealthController]',
      'register HealthController',
    );
  },
  scripts: {
    dev: 'nest start --watch',
    build: 'nest build',
    start: 'node dist/main.js',
    typecheck: 'tsc --noEmit',
  },
  tooling: {
    oxlintRules: {
      // Empty @Module() classes are the Nest idiom.
      'typescript/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
    knipWorkspace: {
      // Setting `entry` replaces knip's defaults, so main.ts must be listed too.
      // The e2e suite runs via `jest --config test/jest-e2e.json`, which knip can't trace.
      entry: ['src/main.ts', 'test/**/*.e2e-spec.ts'],
      // Used through Nest's framework indirection (platform-express typings, sourcemap
      // support at runtime, webpack-mode builds) — invisible to static analysis.
      ignoreDependencies: ['@types/express', 'source-map-support', 'ts-loader'],
    },
  },
  docker: {
    template: 'node-api.Dockerfile.tpl',
    containerPort: 3001,
    hostPort: 3001,
    healthPath: '/health',
    vars: { entry: 'dist/main.js' },
  },
};
