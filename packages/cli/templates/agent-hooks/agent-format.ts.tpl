// Formats and lint-fixes the file(s) an AI coding agent just edited, so agent output is
// already clean by the time a human runs `bun run check`. Wired up by the hook configs
// at the repo root (.claude/settings.json, .cursor/hooks.json, …); the rules mirror
// lint-staged exactly, so a hook-clean file is also a commit-clean file.
//
// Every agent describes the edit as JSON on stdin, each in its own shape — Claude and
// Gemini use `tool_input.file_path`, Cursor `file_path`, Windsurf `tool_info.file_path`,
// Copilot ships `toolArgs` as a JSON-encoded string, and Codex only has the paths inside
// an apply_patch body. Rather than special-case each agent, collect every string under a
// path-like key and parse `*** Update File:` lines. Paths can also be passed as arguments:
//
//   bun scripts/agent-format.ts apps/api/src/index.ts
//
// Contract: runs under bun (uses `bun x` for the repo's own oxlint/oxfmt), never fails
// the agent's turn, and writes nothing to stdout — several agents parse stdout as JSON.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Same file classes as the root package.json `lint-staged` block.
const LINTABLE = /\.(?:[cm]?js|[jt]sx?)$/i;
const FORMATTABLE = /\.(?:{{formatExts}})$/i;
const PATH_KEYS = new Set(['file_path', 'filePath', 'path', 'absolute_path']);
const PATCH_FILE_LINE = /^\*{3} (?:Add|Update) File: (.+)$/gm;
const SKIP_DIRS = new Set(['node_modules', '.git']);

function collect(value: unknown, out: Set<string>, key = ''): void {
  if (typeof value === 'string') {
    if (PATH_KEYS.has(key)) {
      out.add(value);
    } else if (value.startsWith('{')) {
      try {
        collect(JSON.parse(value) as unknown, out);
      } catch {
        // Not JSON — just a string that happens to start with a brace.
      }
    } else {
      for (const match of value.matchAll(PATCH_FILE_LINE)) out.add(match[1]!.trim());
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, out, k);
  }
}

function editedFiles(): string[] {
  const found = new Set<string>(process.argv.slice(2));
  // A TTY stdin means a human ran this by hand with only arguments — don't block on it.
  if (!process.stdin.isTTY) {
    let raw = '';
    try {
      raw = readFileSync(0, 'utf8');
    } catch {
      // No stdin at all (spawned with stdio ignored) — arguments only.
    }
    if (raw.trim() !== '') {
      try {
        collect(JSON.parse(raw) as unknown, found);
      } catch {
        collect(raw, found);
      }
    }
  }

  const files: string[] = [];
  for (const candidate of found) {
    const abs = resolve(ROOT, candidate);
    const rel = relative(ROOT, abs);
    // `relative` uses the platform separator, so split on `sep` rather than a regex.
    if (rel === '' || rel.startsWith('..') || rel.split(sep).some((d) => SKIP_DIRS.has(d))) {
      continue;
    }
    try {
      if (!statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    if (LINTABLE.test(abs) || FORMATTABLE.test(abs)) files.push(abs);
  }
  return [...new Set(files)];
}

function bunx(args: string[]): void {
  // process.execPath is bun here; `bun x` resolves the repo-local binaries first.
  // stdout is discarded on purpose (see contract); diagnostics still reach stderr.
  spawnSync(process.execPath, ['x', ...args], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
}

const files = editedFiles();
if (files.length > 0) {
  const lintable = files.filter((f) => LINTABLE.test(f));
  if (lintable.length > 0) bunx(['oxlint', '--fix', ...lintable]);
  bunx(['oxfmt', ...files]);
}
