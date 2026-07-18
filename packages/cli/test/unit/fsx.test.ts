import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalizePath, rimraf, writeFileLf } from '../../src/fsx';

const tmp = mkdtempSync(join(tmpdir(), 'sf-fsx-'));

describe('writeFileLf', () => {
  test('normalizes CRLF, writes no BOM, ensures trailing newline', async () => {
    const path = join(tmp, 'a', 'file.txt');
    await writeFileLf(path, 'one\r\ntwo');
    const buf = readFileSync(path);
    expect(buf[0]).not.toBe(0xef);
    expect(buf.toString('utf8')).toBe('one\ntwo\n');
  });
});

describe('rimraf', () => {
  test('deletes read-only files (git object style)', async () => {
    const dir = join(tmp, 'ro');
    mkdirSync(join(dir, 'sub'), { recursive: true });
    const file = join(dir, 'sub', 'obj');
    writeFileSync(file, 'x');
    chmodSync(file, 0o444);
    await rimraf(dir);
    expect(existsSync(dir)).toBe(false);
  });
});

describe('canonicalizePath', () => {
  test('resolves the existing ancestor and re-appends missing segments', () => {
    const target = join(tmp, 'not-yet', 'deeper');
    const out = canonicalizePath(target);
    expect(out.endsWith(join('not-yet', 'deeper'))).toBe(true);
    expect(existsSync(join(out, '..', '..'))).toBe(true);
  });
});
