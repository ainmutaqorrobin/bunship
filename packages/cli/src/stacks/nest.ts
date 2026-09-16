import { join } from 'node:path';

import { exec } from '../exec';
import { ensureDir, readJson, writeFileLf, writeJson } from '../fsx';
import { patchFileOrWarn, resolvePin } from './shared';
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
  minNode: '20.0.0',
  async scaffold(ctx) {
    // `nest new` has no --directory flag: the name positional doubles as the target dir,
    // so run it inside apps/. Bun is not an accepted --package-manager value (nest-cli#2223);
    // --skip-install + the root `bun install` covers dependencies anyway.
    await ensureDir(join(ctx.root, 'apps'));
    await exec(
      'bunx',
      [
        resolvePin(PIN),
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
    const pkg = await readJson<{
      type?: string;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>(pkgPath);
    pkg.scripts = { ...pkg.scripts, start: 'node dist/main.js' };
    // Nest 12 ships `nest deploy` + @nestjs/mau for Nest's own cloud. This repo brings
    // its own Docker/VPS pipeline, so the pair is dead weight — and knip fails the
    // generated repo on the unreferenced dependency.
    delete pkg.scripts.deploy;
    delete pkg.devDependencies?.['@nestjs/mau'];
    await writeJson(pkgPath, pkg);

    // Nest 12 emits ESM (`"type": "module"`) with explicit .js specifiers; Nest 11 is
    // CommonJS and extensionless. Every patch below has to land on either shape.
    const ext = pkg.type === 'module' ? '.js' : '';

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
      /import \{ AppController \} from '\.\/app\.controller(?:\.js)?';/,
      `import { AppController } from './app.controller${ext}';\nimport { HealthController } from './health.controller${ext}';`,
      'import HealthController',
    );
    await patchFileOrWarn(
      ctx,
      'src/app.module.ts',
      'controllers: [AppController]',
      'controllers: [AppController, HealthController]',
      'register HealthController',
    );
    // `supertest/types` is types-only — it has no runtime counterpart, and under Nest 12's
    // nodenext/ESM tsconfig the extensionless specifier does not resolve at all. The
    // template never notices: `nest build` excludes test/, and the test runner never
    // typechecks. Our `typecheck` script does cover test/, so it has to resolve there.
    await patchFileOrWarn(
      ctx,
      'test/app.e2e-spec.ts',
      /import (?:type )?\{ App \} from 'supertest\/types(?:\.js)?';/,
      `import type { App } from 'supertest/types${ext}';`,
      'make the supertest type import resolvable',
    );
  },
  scripts: {
    dev: 'nest start --watch',
    build: 'nest build',
    start: 'node dist/main.js',
    typecheck: 'tsc --noEmit',
  },
  // No first-party NestJS skill exists; this is the most-installed community one and is
  // structured like Vercel's (40 rules, 10 categories). Swap it the day nestjs/* ships one.
  skills: [
    {
      source: 'kadajett/agent-nestjs-skills',
      name: 'nestjs-best-practices',
      by: 'community (kadajett)',
      about:
        'NestJS modules, DI, controllers/services, guards/pipes/interceptors, error handling, testing. Load before writing Nest code.',
    },
  ],
  tooling: {
    oxlintRules: {
      // Empty @Module() classes are the Nest idiom.
      'typescript/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
    knipWorkspace: {
      // Setting `entry` replaces knip's defaults, so main.ts must be listed too.
      // The e2e suite runs from its own config (jest on 11, vitest on 12), which
      // knip can't trace back to these files.
      entry: ['src/main.ts', 'test/**/*.e2e-spec.ts'],
      // Used through Nest's framework indirection (platform-express typings, sourcemap
      // support at runtime, webpack-mode builds) — invisible to static analysis.
      // Filtered against the app's real dependencies before knip.json is written, so
      // entries that a newer Nest drops (ts-loader on 12) don't linger as config hints.
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
