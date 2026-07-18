import { existsSync, realpathSync } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * Expand Windows 8.3 short paths (AINMU~1.ROB) to their long form. Mixing the two
 * spellings makes bun record machine-specific relative workspace paths in bun.lock.
 * Works for not-yet-existing targets by realpathing the nearest existing ancestor.
 */
export function canonicalizePath(path: string): string {
  const missing: string[] = [];
  let current = path;
  while (!existsSync(current)) {
    missing.unshift(basename(current));
    const parent = dirname(current);
    if (parent === current) return path;
    current = parent;
  }
  try {
    return join(realpathSync.native(current), ...missing);
  } catch {
    return path;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Write text with LF line endings, UTF-8 without BOM, trailing newline. */
export async function writeFileLf(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  const lf = content.replace(/\r\n/g, '\n');
  await writeFile(path, lf.endsWith('\n') ? lf : `${lf}\n`, 'utf8');
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFileLf(path, JSON.stringify(value, null, 2));
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function dirState(path: string): Promise<'missing' | 'empty' | 'nonempty'> {
  try {
    const entries = await readdir(path);
    return entries.length === 0 ? 'empty' : 'nonempty';
  } catch {
    return 'missing';
  }
}

async function makeWritable(target: string): Promise<void> {
  const s = await stat(target).catch(() => null);
  if (!s) return;
  if (s.isDirectory()) {
    await chmod(target, 0o777).catch(() => undefined);
    for (const entry of await readdir(target).catch(() => [] as string[])) {
      await makeWritable(join(target, entry));
    }
  } else {
    await chmod(target, 0o666).catch(() => undefined);
  }
}

/**
 * Recursive delete that survives Windows quirks: git object files are read-only,
 * so plain fs.rm fails with EPERM (e.g. the nested .git that create-expo-app leaves).
 */
export async function rimraf(target: string): Promise<void> {
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY' && code !== 'ENOTEMPTY')
      throw err;
  }
  await makeWritable(target);
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
