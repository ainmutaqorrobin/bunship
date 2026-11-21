import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PRODUCT } from '../../src/branding';
import type { ProjectConfig, StackId } from '../../src/config/schema';
import {
  CLI_MIN_NODE,
  meetsMinVersion,
  nodeBoundStack,
  nodeFloor,
} from '../../src/stacks/registry';

function cfg(stacks: Partial<Record<'web' | 'mobile' | 'api', StackId>>): ProjectConfig {
  return {
    stacks: { web: null, mobile: null, api: null, ...stacks },
  } as ProjectConfig;
}

describe('meetsMinVersion', () => {
  test('compares numerically, not lexically', () => {
    // The bug a string compare would introduce: "9" > "22".
    expect(meetsMinVersion('22.19.0', '9.0.0')).toBe(true);
    expect(meetsMinVersion('20.19.5', '22.19.0')).toBe(false);
  });

  test('an exact match satisfies the floor', () => {
    expect(meetsMinVersion('22.19.0', '22.19.0')).toBe(true);
  });

  test('minor and patch are not ignored', () => {
    expect(meetsMinVersion('22.18.9', '22.19.0')).toBe(false);
    expect(meetsMinVersion('22.19.1', '22.19.0')).toBe(true);
  });

  test('missing segments count as zero', () => {
    expect(meetsMinVersion('24', '22.19.0')).toBe(true);
    expect(meetsMinVersion('22', '22.19.0')).toBe(false);
  });
});

describe('nodeFloor', () => {
  test('falls back to the CLI floor when no selected stack declares one', () => {
    expect(nodeFloor(cfg({ api: 'hono' }))).toEqual({
      min: CLI_MIN_NODE,
      label: PRODUCT,
      source: 'cli',
    });
  });

  test('a stack floor below the CLI floor never lowers it', () => {
    // Nest asks upstream for Node 20, but the skills CLI needs 22.20 regardless.
    expect(nodeFloor(cfg({ api: 'nest' }))).toEqual({
      min: CLI_MIN_NODE,
      label: PRODUCT,
      source: 'cli',
    });
  });

  test('reports the stack that raises the floor above the CLI floor', () => {
    expect(nodeFloor(cfg({ web: 'nuxt' }))).toEqual({
      min: '22.22.3',
      label: 'Nuxt',
      source: 'stack',
    });
  });

  test('takes the strictest floor across selected stacks', () => {
    // Nest (20) is laxer than Nuxt (22.22.3), so the error must name Nuxt.
    expect(nodeFloor(cfg({ web: 'nuxt', api: 'nest' }))).toEqual({
      min: '22.22.3',
      label: 'Nuxt',
      source: 'stack',
    });
  });
});

describe('nodeBoundStack', () => {
  test('null for stacks without a floor, so Bun-only machines are not refused', () => {
    expect(nodeBoundStack(cfg({ api: 'hono' }))).toBeNull();
    expect(nodeBoundStack(cfg({ api: 'express' }))).toBeNull();
  });

  test('names a floored stack even when its floor is below the CLI floor', () => {
    expect(nodeBoundStack(cfg({ api: 'nest' }))).toBe('NestJS');
    expect(nodeBoundStack(cfg({ web: 'next', api: 'hono' }))).toBe('Next.js');
  });

  test('names the same stack the floor error would', () => {
    expect(nodeBoundStack(cfg({ web: 'nuxt', api: 'nest' }))).toBe('Nuxt');
  });
});

describe('CLI_MIN_NODE', () => {
  test('matches the engines field npm shows to npx users', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, '..', '..', 'package.json'), 'utf8'),
    ) as { engines: { node: string } };
    expect(pkg.engines.node).toBe('>=' + CLI_MIN_NODE);
  });
});
