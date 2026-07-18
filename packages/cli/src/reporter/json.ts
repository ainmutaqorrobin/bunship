import { PRODUCT } from '../branding';
import type { Reporter, TaskHandle } from './types';

// Agent contract: stdout carries EXACTLY ONE JSON document (the manifest).
// Everything else — progress, warnings — goes to stderr.
const line = (message: string): void => {
  process.stderr.write(`[${PRODUCT}] ${message}\n`);
};

export function createJsonReporter(): Reporter {
  return {
    intro(title) {
      line(title);
    },
    task(title): TaskHandle {
      line(`${title}…`);
      return {
        update: (message) => line(`${title} — ${message}`),
        succeed: (message) => line(`${title} ✓${message ? ` (${message})` : ''}`),
        fail: (message) => line(`${title} ✗${message ? ` (${message})` : ''}`),
      };
    },
    info: line,
    warn: (message) => line(`warn: ${message}`),
    outro(manifest) {
      process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}
