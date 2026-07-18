import { existsSync } from 'node:fs';

import { clackIsCancelIsReal, isCancelSafe } from './prompts';
import { templatesRoot } from './template';

// Runs as part of `build` so a bundler regression fails the build, not a user.
export function selftest(): void {
  const failures: string[] = [];
  if (!clackIsCancelIsReal) failures.push('@clack/prompts `isCancel` export missing from bundle');
  if (typeof isCancelSafe !== 'function') failures.push('isCancelSafe is not a function');
  if (!existsSync(templatesRoot)) failures.push(`templates dir not found at ${templatesRoot}`);

  if (failures.length > 0) {
    console.error(`[selftest] FAIL:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.error('[selftest] OK');
}
