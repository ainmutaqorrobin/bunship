import { describe, expect, test } from 'bun:test';

import { BIN_NAME, PRODUCT } from '../../src/branding';

describe('branding', () => {
  test('bin name follows the npm create-* convention', () => {
    expect(BIN_NAME).toBe(`create-${PRODUCT}`);
    expect(BIN_NAME.startsWith('create-')).toBe(true);
  });

  test('product name is npm-safe (lowercase, no spaces)', () => {
    expect(PRODUCT).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});
