import { describe, expect, test } from 'bun:test';

import { resolveConfig } from '../../src/config/resolve';
import { UsageError } from '../../src/errors';

const base = { git: true, install: true };

describe('resolveConfig', () => {
  test('json mode is strict: unspecified stacks stay off', async () => {
    await expect(resolveConfig('demo-app', { ...base, json: true })).rejects.toThrow(
      /Nothing to scaffold/,
    );
  });

  test('json mode with explicit stacks', async () => {
    const cfg = await resolveConfig('demo-app', { ...base, json: true, web: 'next', api: 'hono' });
    expect(cfg.stacks).toEqual({ web: 'next', mobile: null, api: 'hono' });
    expect(cfg.docker).toBe(false);
    expect(cfg.cicd).toBe(false);
    expect(cfg.output).toBe('json');
  });

  test('--yes applies defaults (next + nest + docker + cicd)', async () => {
    const cfg = await resolveConfig('demo-app', { ...base, yes: true });
    expect(cfg.stacks.web).toBe('next');
    expect(cfg.stacks.mobile).toBeNull();
    expect(cfg.stacks.api).toBe('nest');
    expect(cfg.docker).toBe(true);
    expect(cfg.cicd).toBe(true);
  });

  test('cicd implies docker', async () => {
    const cfg = await resolveConfig('demo-app', { ...base, json: true, api: 'nest', cicd: true });
    expect(cfg.docker).toBe(true);
  });

  test('explicit --no-docker with --cicd is a usage error', async () => {
    await expect(
      resolveConfig('demo-app', { ...base, json: true, api: 'nest', cicd: true, docker: false }),
    ).rejects.toBeInstanceOf(UsageError);
  });

  test('project name derives from the dir basename, lowercased', async () => {
    const cfg = await resolveConfig('Demo-App', { ...base, json: true, api: 'express' });
    expect(cfg.projectName).toBe('demo-app');
  });

  test('invalid explicit --name is a usage error', async () => {
    await expect(
      resolveConfig('demo', { ...base, json: true, api: 'express', name: 'Bad Name' }),
    ).rejects.toBeInstanceOf(UsageError);
  });

  test('non-interactive without a dir is a usage error', async () => {
    await expect(
      resolveConfig(undefined, { ...base, json: true, api: 'express' }),
    ).rejects.toBeInstanceOf(UsageError);
  });
});
