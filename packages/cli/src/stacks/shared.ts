import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { pathExists, readJson, rimraf, writeFileLf, writeJson } from '../fsx';
import type { AppCtx, StackAdapter } from './types';

/**
 * SCAFFOLDER_CANARY=1 strips version pins (the nightly drift-canary runs the whole
 * matrix against @latest scaffolders so flag changes are caught before users hit them).
 */
export function resolvePin(pin: string): string {
  if (process.env.SCAFFOLDER_CANARY !== '1') return pin;
  const at = pin.lastIndexOf('@');
  return at > 0 ? pin.slice(0, at) : pin;
}

// Scaffolder residue that must never survive inside a workspace app.
const JUNK = [
  '.git',
  'node_modules',
  '.claude',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.eslintignore',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierignore',
  'prettier.config.js',
  'prettier.config.mjs',
  'biome.json',
  'biome.jsonc',
  // Some scaffolders (e.g. create-vite@9) now ship oxc configs themselves; the root
  // config must stay the single source of truth (oxlint is nearest-config-wins).
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
  '.oxfmtrc.json',
  '.oxfmtrc.jsonc',
  'oxlint.config.ts',
  'oxlint.config.mts',
  'AGENTS.md',
  'CLAUDE.md',
];

function isLintFormatDep(dep: string): boolean {
  return (
    dep === 'eslint' ||
    dep === 'prettier' ||
    dep === 'oxlint' ||
    dep === 'oxfmt' ||
    dep === 'typescript-eslint' ||
    dep === 'globals' || // only ever present for ESLint configs in scaffolded apps
    dep === '@next/eslint-plugin-next' ||
    dep.startsWith('eslint-') ||
    dep.startsWith('prettier-') ||
    dep.startsWith('@eslint/') ||
    dep.startsWith('@eslint-community/') ||
    dep.startsWith('@typescript-eslint/') ||
    dep.startsWith('@biomejs/')
  );
}

/** Step-owned cleanup applied to every scaffolded app (root oxc replaces per-app linters). */
export async function universalCleanup(ctx: AppCtx): Promise<void> {
  for (const name of JUNK) {
    const target = join(ctx.appDir, name);
    if (await pathExists(target)) await rimraf(target);
  }
}

interface PkgJson {
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

/** Rename to @project/app, ensure missing scripts, strip lint/format deps. */
export async function ensureAppPackageJson(ctx: AppCtx, adapter: StackAdapter): Promise<void> {
  const pkgPath = join(ctx.appDir, 'package.json');
  const pkg = await readJson<PkgJson>(pkgPath);
  pkg.name = ctx.pkgName;
  pkg.private = true;
  pkg.scripts ??= {};
  // Per-app lint/format scripts are replaced by the root oxc toolchain.
  for (const [key, command] of Object.entries(pkg.scripts)) {
    if (/\b(?:eslint|prettier|biome)\b/.test(command)) {
      delete pkg.scripts[key];
      continue;
    }
    // Bun-first repos: scripts must not depend on npm being present.
    if (command.includes('npm run ')) {
      pkg.scripts[key] = command.replaceAll('npm run ', 'bun run ');
    }
  }
  for (const [key, value] of Object.entries(adapter.scripts)) {
    pkg.scripts[key] ??= value;
  }
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const dep of Object.keys(deps)) {
      if (isLintFormatDep(dep)) delete deps[dep];
    }
    if (Object.keys(deps).length === 0) delete pkg[field];
  }
  await writeJson(pkgPath, pkg);
}

/** Targeted content patch against pinned scaffolder output; warns instead of failing on drift. */
export async function patchFileOrWarn(
  ctx: AppCtx,
  relFile: string,
  from: string | RegExp,
  to: string,
  what: string,
): Promise<boolean> {
  const path = join(ctx.appDir, relFile);
  if (!(await pathExists(path))) {
    ctx.report.warn(`${ctx.relDir}/${relFile} not found — skipped: ${what}`);
    return false;
  }
  const content = await readFile(path, 'utf8');
  const patched = content.replace(from, to);
  if (patched === content) {
    ctx.report.warn(`Pattern not found in ${ctx.relDir}/${relFile} — skipped: ${what}`);
    return false;
  }
  await writeFileLf(path, patched);
  return true;
}
