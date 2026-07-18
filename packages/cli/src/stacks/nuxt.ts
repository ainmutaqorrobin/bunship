import { join } from 'node:path';

import { exec } from '../exec';
import { readJson, writeJson } from '../fsx';
import type { StackAdapter } from './types';

const PIN = 'create-nuxt@3';

export const nuxt: StackAdapter = {
  id: 'nuxt',
  kind: 'web',
  label: 'Nuxt',
  dirName: 'web',
  devPort: 3000,
  scaffolderPin: PIN,
  async scaffold(ctx) {
    // --template is REQUIRED in non-interactive terminals ("minimal" = Nuxt 4 starter).
    await exec(
      'bunx',
      [
        PIN,
        'web',
        '--template',
        'minimal',
        '--packageManager',
        'bun',
        '--gitInit=false',
        '--no-install',
        '--no-modules',
      ],
      { cwd: join(ctx.root, 'apps'), verbose: ctx.verbose },
    );
  },
  async postProcess(ctx) {
    // `nuxt typecheck` needs vue-tsc + typescript, which the minimal starter omits.
    const pkgPath = join(ctx.appDir, 'package.json');
    const pkg = await readJson<{ devDependencies?: Record<string, string> }>(pkgPath);
    pkg.devDependencies = {
      ...pkg.devDependencies,
      typescript: '^5.9.0',
      'vue-tsc': '^3.0.0',
    };
    await writeJson(pkgPath, pkg);
  },
  scripts: {
    typecheck: 'nuxt typecheck',
  },
  tooling: {
    formatExtensions: ['vue'],
    gitignore: ['.nuxt/', '.output/'],
    knipWorkspace: {
      // Wired up by the Nuxt runtime/CLI (auto-imports, `nuxt typecheck`) — invisible
      // to knip's static analysis.
      ignoreDependencies: ['vue', 'vue-router', 'vue-tsc'],
    },
  },
  docker: {
    template: 'nuxt.Dockerfile.tpl',
    containerPort: 3000,
    hostPort: 3000,
    healthPath: '/',
  },
};
