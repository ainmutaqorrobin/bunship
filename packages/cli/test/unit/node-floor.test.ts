import { describe, expect, test } from 'bun:test';

import type { ProjectConfig, StackId } from '../../src/config/schema';
import { meetsMinVersion, nodeFloor } from '../../src/stacks/registry';

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
  test('null when no selected stack declares one', () => {
    expect(nodeFloor(cfg({ api: 'hono' }))).toBeNull();
  });

  test('reports the stack that demands the floor', () => {
    expect(nodeFloor(cfg({ web: 'nuxt' }))).toEqual({ min: '22.19.0', label: 'Nuxt' });
  });

  test('takes the strictest floor across selected stacks', () => {
    // Nest (20) is laxer than Nuxt (22.19) — the error must name Nuxt.
    expect(nodeFloor(cfg({ web: 'nuxt', api: 'nest' }))).toEqual({
      min: '22.19.0',
      label: 'Nuxt',
    });
  });

  test('ignores stacks that are not selected', () => {
    expect(nodeFloor(cfg({ api: 'nest' }))).toEqual({ min: '20.0.0', label: 'NestJS' });
  });
});
