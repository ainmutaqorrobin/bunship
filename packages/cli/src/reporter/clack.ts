import * as p from '@clack/prompts';

import type { Reporter, TaskHandle } from './types';

export function createClackReporter(): Reporter {
  return {
    intro(title) {
      p.intro(title);
    },
    task(title): TaskHandle {
      const s = p.spinner();
      s.start(title);
      return {
        update: (message) => s.message(`${title} — ${message}`),
        succeed: (message) => s.stop(message ?? title),
        fail: (message) => s.stop(message ?? `${title} failed`),
      };
    },
    info: (message) => p.log.info(message),
    warn: (message) => p.log.warn(message),
    outro(manifest) {
      if (!manifest.ok) {
        p.log.error(manifest.error?.message ?? 'Scaffold failed.');
        const tail = manifest.error?.tail;
        if (tail && tail.length > 0) p.log.message(tail.join('\n'));
        if (manifest.error?.hint) p.log.info(manifest.error.hint);
        p.outro('Scaffold failed.');
        return;
      }
      const apps = manifest.apps.map(
        (a) =>
          `apps/${a.dir}  ${a.stack}${a.devPort === null ? '' : `  (dev :${String(a.devPort)})`}`,
      );
      p.note([`→ ${manifest.root}`, ...apps].join('\n'), manifest.projectName);
      p.note(manifest.nextSteps.join('\n'), 'Next steps');
      p.outro(manifest.dryRun ? 'Dry run — nothing was written.' : 'Happy shipping!');
    },
  };
}
