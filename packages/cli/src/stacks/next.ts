import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { exec } from '../exec';
import { pathExists } from '../fsx';
import { patchFileOrWarn, resolvePin } from './shared';
import type { StackAdapter } from './types';

const PIN = 'create-next-app@16';

const CONFIG_KEYS = `  // Standalone server output for the Docker image, traced from the monorepo root so
  // workspace dependencies land in the bundle.
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  // Next >=16.3 otherwise upserts its own AGENTS.md/CLAUDE.md into this app the first time
  // \`next dev\` runs under a coding agent. The root AGENTS.md is the single agent guide for
  // this monorepo and already points at the bundled docs, so keep the tree clean.
  agentRules: false,
`;

export const next: StackAdapter = {
  id: 'next',
  kind: 'web',
  label: 'Next.js',
  dirName: 'web',
  devPort: 3000,
  scaffolderPin: PIN,
  minNode: '20.9.0',
  async scaffold(ctx) {
    // Relative dir + cwd=apps/: some scaffolders mis-handle absolute Windows paths.
    await exec(
      'bunx',
      [
        resolvePin(PIN),
        'web',
        '--ts',
        '--tailwind',
        '--app',
        '--src-dir',
        '--import-alias',
        '@/*',
        '--no-linter',
        '--turbopack',
        '--use-bun',
        '--disable-git',
        '--skip-install',
        '--no-agents-md',
        '--yes',
      ],
      { cwd: join(ctx.root, 'apps'), verbose: ctx.verbose },
    );
  },
  async postProcess(ctx) {
    // Patch upstream's next.config.ts rather than replacing it: since 16.4 it carries the
    // Tailwind wiring (a Turbopack `*.css` loader for @tailwindcss/turbopack — there is no
    // postcss.config.mjs any more) plus defaults like cacheComponents. Overwriting it
    // shipped apps with unprocessed Tailwind and an unused dep that failed knip.
    await patchFileOrWarn(
      ctx,
      'next.config.ts',
      /^(import type \{ NextConfig \} from ["']next["'];?\r?\n)/m,
      `import path from 'node:path';\n$1\nconst monorepoRoot = path.join(__dirname, '../..');\n`,
      'resolve the monorepo root',
    );
    await patchFileOrWarn(
      ctx,
      'next.config.ts',
      /(const nextConfig: NextConfig = \{\r?\n)/,
      `$1${CONFIG_KEYS}`,
      'standalone output + monorepo file tracing (Docker image) and agentRules off',
    );
    // Turbopack must be rooted at the monorepo so workspace deps resolve. Merge into
    // upstream's block when it has one (16.4+); older 16.x configs have none.
    const configPath = join(ctx.appDir, 'next.config.ts');
    const hasTurbopack =
      (await pathExists(configPath)) && /\bturbopack: \{/.test(await readFile(configPath, 'utf8'));
    await patchFileOrWarn(
      ctx,
      'next.config.ts',
      hasTurbopack ? /(\bturbopack: \{\r?\n)/ : /(\n {2}agentRules: false,\n)/,
      hasTurbopack ? '$1    root: monorepoRoot,\n' : '$1  turbopack: { root: monorepoRoot },\n',
      'root Turbopack at the monorepo',
    );
  },
  scripts: {
    dev: 'next dev --turbopack',
    build: 'next build',
    start: 'next start',
    // `next typegen` first: since 16.3 the scaffolded layout.tsx uses the global
    // LayoutProps helper, which only exists after `next dev`/`build`/`typegen` writes
    // .next/types. Plain `tsc --noEmit` on a fresh clone would fail with TS2304.
    typecheck: 'next typegen && tsc --noEmit',
  },
  skills: [
    {
      source: 'vercel-labs/agent-skills',
      name: 'vercel-react-best-practices',
      by: 'Vercel',
      about:
        'React/Next.js performance rules (waterfalls, bundle size, re-renders, server components). Load before writing or reviewing React code.',
    },
  ],
  tooling: {
    oxlintPlugins: ['react', 'jsx-a11y', 'nextjs'],
    oxlintRules: {
      // Modern JSX transform — React does not need to be in scope.
      'react/react-in-jsx-scope': 'off',
      // Side-effect CSS imports (globals.css) are idiomatic in Next.js.
      'import/no-unassigned-import': 'off',
    },
    gitignore: ['.next/', 'next-env.d.ts'],
    // The one line Next's own managed AGENTS.md block exists to deliver (agentRules is off
    // in next.config.ts so it does not fight the root guide): version-matched docs ship in
    // the package, and agents measurably do better reading them than guessing from memory.
    agentsMd: [
      '- Next.js docs matching the installed version are bundled at `node_modules/next/dist/docs/`.',
      '  Read the relevant guide there before writing Next code — APIs and conventions may differ',
      '  from your training data. `apps/web` has `agentRules: false`; this file is the agent guide.',
    ],
  },
  docker: {
    dev: { args: ['-H', '0.0.0.0'] },
    template: 'next.Dockerfile.tpl',
    containerPort: 3000,
    hostPort: 3000,
    healthPath: '/',
  },
};
