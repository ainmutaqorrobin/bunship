import { join } from 'node:path';

import { exec } from '../exec';
import { readJson, writeJson } from '../fsx';
import { resolvePin } from './shared';
import type { StackAdapter } from './types';

const PIN = 'create-nuxt@3';

export const nuxt: StackAdapter = {
  id: 'nuxt',
  kind: 'web',
  label: 'Nuxt',
  dirName: 'web',
  devPort: 3000,
  scaffolderPin: PIN,
  minNode: '22.19.0',
  async scaffold(ctx) {
    // --template is REQUIRED in non-interactive terminals ("minimal" = Nuxt 4 starter).
    await exec(
      'bunx',
      [
        resolvePin(PIN),
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
  // antfu/skills is generated from the official Vue/Nuxt docs by a core-team member —
  // the closest thing to first-party until nuxt/* ships framework skills of its own.
  skills: [
    {
      source: 'antfu/skills',
      name: 'nuxt',
      by: 'Anthony Fu (Vue/Nuxt core)',
      about:
        'Nuxt 4: file-based routing, server routes, middleware, modules, config. Load before writing Nuxt code.',
    },
    {
      source: 'antfu/skills',
      name: 'vue',
      by: 'Anthony Fu (Vue/Nuxt core)',
      about: 'Vue 3 reactivity, Composition API, components and composables.',
    },
  ],
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
    dev: { args: ['--host', '0.0.0.0'] },
    template: 'nuxt.Dockerfile.tpl',
    containerPort: 3000,
    hostPort: 3000,
    healthPath: '/',
  },
};
