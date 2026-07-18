import * as p from '@clack/prompts';

// Some bundlers have dropped clack's `isCancel` runtime export (bombshell-dev/clack#470).
// This module is the ONLY importer of @clack/prompts; everything else goes through it.
export const clackIsCancelIsReal = typeof p.isCancel === 'function';

const CLACK_CANCEL = Symbol.for('clack:cancel');

export function isCancelSafe(value: unknown): value is symbol {
  return clackIsCancelIsReal ? p.isCancel(value) : value === CLACK_CANCEL;
}
