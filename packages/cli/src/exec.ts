import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const TAIL_LINES = 40;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

let cachedBun: string | null = null;

/**
 * Locate a real bun.exe on Windows. spawn(shell:false) cannot run .cmd shims, and
 * npm-global installs (e.g. under nvm4w) put only bun.cmd on PATH — the actual exe
 * lives in the global node_modules next to the shim.
 */
function findBunExe(): string {
  if (process.platform !== 'win32') return 'bun';
  if (cachedBun) return cachedBun;
  const candidates: string[] = [];
  if (process.env.BUN_INSTALL) candidates.push(join(process.env.BUN_INSTALL, 'bin', 'bun.exe'));
  if (process.env.USERPROFILE) {
    candidates.push(join(process.env.USERPROFILE, '.bun', 'bin', 'bun.exe'));
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue;
    candidates.push(join(dir, 'bun.exe'));
    candidates.push(join(dir, 'node_modules', 'bun', 'bin', 'bun.exe'));
  }
  cachedBun = candidates.find((c) => existsSync(c)) ?? 'bun';
  return cachedBun;
}

export interface ExecOptions {
  cwd: string;
  env?: Record<string, string>;
  /** Stream child output to the terminal instead of buffering it. */
  verbose?: boolean;
  timeoutMs?: number;
}

export class ExecError extends Error {
  readonly command: string;
  readonly code: number | null;
  readonly tail: string[];

  constructor(command: string, code: number | null, tail: string[]) {
    super(`\`${command}\` exited with code ${String(code)}`);
    this.name = 'ExecError';
    this.command = command;
    this.code = code;
    this.tail = tail;
  }
}

let active: ChildProcess | null = null;

/** Kill the currently running child (used by the SIGINT handler). */
export function killActiveChild(): void {
  const child = active;
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    // taskkill /T takes the whole process tree down (scaffolders spawn their own children).
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

/**
 * Run a real executable (bun / bunx / git) with shell:false.
 * Never used for .cmd shims (npm/npx) — those break on Windows without a shell.
 */
export function exec(cmd: string, args: string[], opts: ExecOptions): Promise<{ stdout: string }> {
  // `bunx` is translated to `bun x` so only one binary ever needs resolving.
  if (cmd === 'bunx') {
    args = ['x', ...args];
    cmd = 'bun';
  }
  if (cmd === 'bun') cmd = findBunExe();
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      shell: false,
      windowsHide: true,
      stdio: opts.verbose ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
    });
    active = child;

    const tail: string[] = [];
    let stdout = '';
    const pushTail = (chunk: Buffer): void => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.trim() === '') continue;
        tail.push(line);
        if (tail.length > TAIL_LINES) tail.shift();
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      pushTail(chunk);
    });
    child.stderr?.on('data', pushTail);

    const timeout = setTimeout(() => {
      pushTail(
        Buffer.from(
          `[timeout] no completion after ${String(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)}ms`,
        ),
      );
      killActiveChild();
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const commandLine = `${cmd} ${args.join(' ')}`;
    child.once('error', (err) => {
      clearTimeout(timeout);
      active = null;
      rejectPromise(new ExecError(`${commandLine} — ${err.message}`, null, tail));
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      active = null;
      if (code === 0) resolvePromise({ stdout });
      else rejectPromise(new ExecError(commandLine, code, tail));
    });
  });
}
