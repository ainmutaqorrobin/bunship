import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
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
    // strict json mode ⇒ no agent hooks unless asked for
    expect(existsSync(join(target, 'scripts'))).toBe(false);
    expect(existsSync(join(target, '.claude'))).toBe(false);
  });

  test('--agents writes the shared script plus one config per agent', () => {
    const target = join(mkdtempSync(join(tmpdir(), 'sf-agents-')), 'demo-app');
    const r = runCli([
      target,
      '--api',
      'express',
      '--agents',
      'claude,copilot',
      '--json',
      '--no-install',
      '--no-git',
    ]);
    expect(r.status).toBe(0);

    const manifest = JSON.parse(r.stdout) as {
      agentHooks: { agents: string[]; script: string; files: string[] } | null;
    };
    expect(manifest.agentHooks?.agents).toEqual(['claude', 'copilot']);
    expect(manifest.agentHooks?.script).toBe('scripts/agent-format.ts');
    expect(manifest.agentHooks?.files).toEqual([
      '.claude/settings.json',
      '.github/hooks/format.json',
    ]);

    const script = readFileSync(join(target, 'scripts', 'agent-format.ts'), 'utf8');
    // Template vars must be rendered, and the extension list must be the real one.
    expect(script).not.toContain('{{');
    expect(script).toContain('/\\.(?:css|json|jsonc|md|yaml|yml)$/i');

    const claude = JSON.parse(readFileSync(join(target, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
    };
    expect(claude.hooks.PostToolUse[0]?.matcher).toBe('Edit|Write');
    expect(claude.hooks.PostToolUse[0]?.hooks[0]?.command).toBe('bun scripts/agent-format.ts');

    // Copilot wants both shells; the bare `bun <script>` form is valid in each.
    const copilot = JSON.parse(
      readFileSync(join(target, '.github', 'hooks', 'format.json'), 'utf8'),
    ) as { hooks: { postToolUse: Array<{ bash: string; powershell: string }> } };
    expect(copilot.hooks.postToolUse[0]?.bash).toBe(copilot.hooks.postToolUse[0]?.powershell);

    // knip must be told about the script, or `bun run check` reports it as an unused file.
    const knip = JSON.parse(readFileSync(join(target, 'knip.json'), 'utf8')) as {
      workspaces: Record<string, { entry?: string[] }>;
    };
    expect(knip.workspaces['.']?.entry).toEqual(['scripts/agent-format.ts']);

    expect(readFileSync(join(target, '.gitignore'), 'utf8')).toContain(
      '.claude/settings.local.json',
    );
    // Unselected agents must leave no trace.
    expect(existsSync(join(target, '.cursor'))).toBe(false);
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
