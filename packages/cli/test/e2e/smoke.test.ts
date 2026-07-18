import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The smoke test exercises the REAL consumer path: the built bundle under node.
// It uses the express adapter (internal template — no network) with --no-install.
const dist = join(import.meta.dir, '..', '..', 'dist', 'index.mjs');
const hasDist = existsSync(dist);

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [dist, ...args], { encoding: 'utf8', timeout: 120_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe.skipIf(!hasDist)('smoke: express-only scaffold via node dist', () => {
  test('creates a valid monorepo and stdout is exactly one JSON document', () => {
    const target = join(mkdtempSync(join(tmpdir(), 'sf-smoke-')), 'demo-app');
    const r = runCli([target, '--api', 'express', '--json', '--no-install', '--no-git']);
    expect(r.status).toBe(0);

    const manifest = JSON.parse(r.stdout) as {
      ok: boolean;
      apps: Array<{ stack: string }>;
      tooling: { bunLinker: string };
    };
    expect(manifest.ok).toBe(true);
    expect(manifest.apps).toHaveLength(1);
    expect(manifest.apps[0]?.stack).toBe('express');
    expect(manifest.tooling.bunLinker).toBe('hoisted');

    for (const rel of [
      'package.json',
      'README.md',
      'AGENTS.md',
      'CLAUDE.md',
      '.oxlintrc.json',
      '.oxfmtrc.json',
      'knip.json',
      'bunfig.toml',
      '.gitattributes',
      join('apps', 'api', 'src', 'index.ts'),
      join('apps', 'api', 'tsconfig.json'),
    ]) {
      expect(existsSync(join(target, rel))).toBe(true);
    }
    // --no-git ⇒ no hooks; scaffolder residue must never survive
    expect(existsSync(join(target, '.husky'))).toBe(false);
    expect(existsSync(join(target, 'apps', 'api', '.git'))).toBe(false);
  });

  test('--dry-run writes nothing and reports dryRun', () => {
    const target = join(mkdtempSync(join(tmpdir(), 'sf-dry-')), 'never');
    const r = runCli([target, '--api', 'express', '--json', '--dry-run']);
    expect(r.status).toBe(0);
    expect((JSON.parse(r.stdout) as { dryRun: boolean }).dryRun).toBe(true);
    expect(existsSync(target)).toBe(false);
  });

  test('usage errors exit 2 with nothing on stdout', () => {
    const r = runCli(['--json']);
    expect(r.status).toBe(2);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr).toContain('Target directory is required');
  });
});
