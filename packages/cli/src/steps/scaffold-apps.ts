import { join } from 'node:path';

import { makeAppCtx } from '../context';
import { ScaffoldError, toScaffoldError } from '../errors';
import { pathExists } from '../fsx';
import { selectedAdapters } from '../stacks/registry';
import { resolvePin } from '../stacks/shared';
import type { Step } from './types';

export const scaffoldApps: Step = {
  id: 'scaffold-apps',
  title: 'Running official scaffolders',
  enabled: () => true,
  async run(rc, task) {
    for (const adapter of selectedAdapters(rc.cfg)) {
      // resolvePin: under SCAFFOLDER_CANARY the pin is stripped, and the log must say so —
      // a canary failure attributed to "@nestjs/cli@11" sends the reader to the wrong version.
      task.update(
        adapter.scaffolderPin
          ? `${adapter.label} (${resolvePin(adapter.scaffolderPin)})`
          : adapter.label,
      );
      const ctx = makeAppCtx(rc, adapter);
      try {
        await adapter.scaffold(ctx);
      } catch (err) {
        throw toScaffoldError(err, 'scaffold-apps', adapter.id);
      }
      // Some scaffolders exit 0 without producing output (e.g. a swallowed prompt).
      // Fail loudly here instead of with a confusing ENOENT later.
      if (!(await pathExists(join(ctx.appDir, 'package.json')))) {
        throw new ScaffoldError(
          `${adapter.label} scaffolder exited successfully but produced no app in ${ctx.relDir}.`,
          {
            step: 'scaffold-apps',
            stackId: adapter.id,
            hint: `The ${adapter.scaffolderPin ?? adapter.id} flags may have drifted — rerun with --verbose to see its output.`,
          },
        );
      }
    }
  },
};
