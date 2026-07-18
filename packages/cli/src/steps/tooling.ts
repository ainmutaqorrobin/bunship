import { join } from 'node:path';

import { BIN_NAME } from '../branding';
import { writeFileLf, writeJson } from '../fsx';
import { selectedAdapters } from '../stacks/registry';
import { BUN_ENGINES, GENERATED_DEV_DEPS, GENERATED_GIT_DEV_DEPS } from '../versions';
import type { Step } from './types';

const BASE_GITIGNORE = [
  'node_modules/',
  'dist/',
  'coverage/',
  '*.log',
  '.env',
  '.env.*',
  '!.env.example',
  '.DS_Store',
];

const BASE_OXLINT_PLUGINS = ['import', 'typescript', 'unicorn'];
const BASE_FORMAT_EXTENSIONS = ['json', 'jsonc', 'md', 'yml', 'yaml', 'css'];

export const tooling: Step = {
  id: 'tooling',
  title: 'Wiring root toolchain (bun, oxc, knip, husky)',
  enabled: () => true,
  async run(rc, task) {
    const { cfg } = rc;
    const root = cfg.targetDir;
    const adapters = selectedAdapters(cfg);

    // Aggregate adapter fragments.
    const oxlintPlugins = new Set(BASE_OXLINT_PLUGINS);
    const oxlintRules: Record<string, unknown> = {};
    const oxlintOverrides: Array<Record<string, unknown>> = [];
    const formatExtensions = new Set(BASE_FORMAT_EXTENSIONS);
    const gitignoreExtra: string[] = [];
    const knipWorkspaces: Record<string, unknown> = { '.': {} };
    let hoisted = false;
    for (const a of adapters) {
      for (const p of a.tooling.oxlintPlugins ?? []) oxlintPlugins.add(p);
      Object.assign(oxlintRules, a.tooling.oxlintRules ?? {});
      oxlintOverrides.push(...(a.tooling.oxlintOverrides ?? []));
      for (const e of a.tooling.formatExtensions ?? []) formatExtensions.add(e);
      for (const g of a.tooling.gitignore ?? []) gitignoreExtra.push(g);
      knipWorkspaces[`apps/${a.dirName}`] = a.tooling.knipWorkspace ?? {};
      if (a.tooling.hoistedLinker) hoisted = true;
    }
    // v1: always hoist. Bun >=1.3.2 defaults new workspaces to the isolated linker, but
    // framework toolchains still assume a flat node_modules (verified: Turbopack builds
    // fail under isolated on Windows; Metro requires flat). Revisit per-stack later.
    hoisted = true;
    rc.bunLinker = hoisted ? 'hoisted' : 'isolated';

    // Root package.json
    task.update('package.json');
    const scripts: Record<string, string> = { dev: "bun --filter '*' dev" };
    for (const a of adapters) {
      scripts[`dev:${a.dirName}`] = `bun --filter '@${cfg.projectName}/${a.dirName}' dev`;
    }
    Object.assign(scripts, {
      build: "bun --filter '*' build",
      typecheck: "bun --filter '*' typecheck",
      lint: 'oxlint',
      'lint:fix': 'oxlint --fix',
      format: 'oxfmt',
      'format:check': 'oxfmt --check',
      knip: 'knip',
      check: 'bun run lint && bun run format:check && bun run typecheck && bun run knip',
    });
    if (cfg.git) scripts.prepare = 'husky';
    rc.rootScripts = scripts;

    const devDependencies = Object.fromEntries(
      Object.entries({
        ...GENERATED_DEV_DEPS,
        ...(cfg.git ? GENERATED_GIT_DEV_DEPS : {}),
      }).toSorted(([a], [b]) => a.localeCompare(b)),
    );

    const fmtGlob = `**/*.{${[...formatExtensions].toSorted().join(',')}}`;
    await writeJson(join(root, 'package.json'), {
      name: cfg.projectName,
      private: true,
      type: 'module',
      workspaces: ['apps/*'],
      engines: { bun: BUN_ENGINES },
      scripts,
      devDependencies,
      ...(cfg.git
        ? {
            'lint-staged': {
              '**/*.{ts,tsx,js,jsx,mjs,cjs}': ['oxlint --fix', 'oxfmt'],
              [fmtGlob]: ['oxfmt'],
            },
          }
        : {}),
    });

    // Lint / format / knip configs
    task.update('oxc + knip configs');
    await writeJson(join(root, '.oxlintrc.json'), {
      $schema: './node_modules/oxlint/configuration_schema.json',
      plugins: [...oxlintPlugins].toSorted(),
      categories: { correctness: 'error', suspicious: 'warn' },
      ...(Object.keys(oxlintRules).length > 0 ? { rules: oxlintRules } : {}),
      ...(oxlintOverrides.length > 0 ? { overrides: oxlintOverrides } : {}),
      env: { browser: true, node: true },
      ignorePatterns: [
        '**/dist',
        '**/node_modules',
        '**/.next',
        '**/.nuxt',
        '**/.output',
        '**/.expo',
      ],
    });
    await writeJson(join(root, '.oxfmtrc.json'), {
      $schema: './node_modules/oxfmt/configuration_schema.json',
      printWidth: 100,
      singleQuote: true,
    });
    await writeJson(join(root, 'knip.json'), {
      $schema: 'https://unpkg.com/knip@6/schema.json',
      workspaces: knipWorkspaces,
    });

    if (hoisted) {
      await writeFileLf(
        join(root, 'bunfig.toml'),
        [
          '[install]',
          '# Framework toolchains (Turbopack, Metro) still assume a flat node_modules,',
          "# so we opt out of Bun's isolated-linker default for new workspaces.",
          'linker = "hoisted"',
        ].join('\n'),
      );
    }

    // Git hygiene + hooks + editor setup
    task.update('git hygiene and hooks');
    await writeFileLf(join(root, '.gitignore'), [...BASE_GITIGNORE, ...gitignoreExtra].join('\n'));
    await writeFileLf(join(root, '.gitattributes'), '* text=auto eol=lf');
    if (cfg.git) {
      await writeFileLf(join(root, '.husky', 'pre-commit'), 'bunx lint-staged');
      await writeFileLf(join(root, '.husky', 'pre-push'), 'bun run check');
    }
    await writeJson(join(root, '.vscode', 'extensions.json'), {
      recommendations: ['oxc.oxc-vscode'],
    });
    await writeJson(join(root, '.vscode', 'settings.json'), {
      'editor.defaultFormatter': 'oxc.oxc-vscode',
      'editor.formatOnSave': true,
    });

    // README
    task.update('README');
    const appRows = adapters.map(
      (a) =>
        `| \`apps/${a.dirName}\` | ${a.label} | ${a.devPort === null ? '—' : `http://localhost:${String(a.devPort)}`} |`,
    );
    const readme = [
      `# ${cfg.projectName}`,
      '',
      `Bun monorepo scaffolded with ${BIN_NAME}.`,
      '',
      '## Apps',
      '',
      '| App | Stack | Dev URL |',
      '| --- | --- | --- |',
      ...appRows,
      '',
      '## Commands',
      '',
      '```sh',
      'bun install',
      'bun run dev            # all dev servers in parallel (bun --filter)',
      ...adapters.map((a) => `bun run dev:${a.dirName}     # only ${a.label}`),
      'bun run build          # build all apps',
      'bun run check          # oxlint + oxfmt + typecheck + knip',
      'bun run lint:fix       # autofix lint findings',
      'bun run format         # format the whole repo (oxfmt)',
      '```',
      '',
      '## Toolchain',
      '',
      '- **Bun workspaces** — package management + task running (`bun --filter`)',
      '- **oxlint / oxfmt** — linting and formatting (VS Code: `oxc.oxc-vscode`)',
      '  - `oxfmt` is pinned exactly while in beta; bump with `bun update oxfmt && bun run format`',
      '- **knip** — unused files, exports and dependencies',
      ...(cfg.git
        ? ['- **husky + lint-staged** — pre-commit format/lint, pre-push `bun run check`']
        : []),
    ].join('\n');
    await writeFileLf(join(root, 'README.md'), readme);

    // Agent guide: lets coding agents work in the repo without re-deriving conventions.
    task.update('AGENTS.md');
    const agentsMd = [
      `# ${cfg.projectName} — agent guide`,
      '',
      `Bun monorepo generated by ${BIN_NAME}. Everything below is enforced by tooling.`,
      '',
      '## Layout',
      '',
      ...adapters.map(
        (a) =>
          `- \`apps/${a.dirName}\` — ${a.label}${a.devPort === null ? '' : ` (dev port ${String(a.devPort)})`}`,
      ),
      '',
      '## Commands (always from the repo root)',
      '',
      '```sh',
      'bun install            # bun is the ONLY package manager here',
      'bun run dev            # all dev servers; dev:<app> for one',
      'bun run build',
      'bun run check          # oxlint + oxfmt --check + typecheck + knip — must pass before pushing',
      'bun run lint:fix       # autofix lint',
      'bun run format         # oxfmt writes',
      '```',
      '',
      '## Conventions',
      '',
      '- Lint/format configs live at the ROOT ONLY (`.oxlintrc.json`, `.oxfmtrc.json`).',
      '  Never add per-app ESLint/Prettier/oxc configs.',
      '- `knip.json` governs unused-code detection; add intentional exceptions there.',
      '- `bunfig.toml` pins the hoisted linker — do not remove it (Turbopack/Metro need it).',
      ...(cfg.stacks.api
        ? ['- The API serves `GET /health` and reads `PORT` (default 3001).']
        : []),
      ...(cfg.git
        ? [
            '- Pre-commit runs lint-staged (oxlint --fix + oxfmt on staged files); pre-push runs `bun run check`.',
          ]
        : []),
    ].join('\n');
    await writeFileLf(join(root, 'AGENTS.md'), agentsMd);
    await writeFileLf(join(root, 'CLAUDE.md'), '@AGENTS.md');
  },
};
