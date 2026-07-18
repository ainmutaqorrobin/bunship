import { makeAppCtx } from '../context';
import { toScaffoldError } from '../errors';
import { selectedAdapters } from '../stacks/registry';
import type { Step } from './types';

export const scaffoldApps: Step = {
  id: 'scaffold-apps',
  title: 'Running official scaffolders',
  enabled: () => true,
  async run(rc, task) {
    for (const adapter of selectedAdapters(rc.cfg)) {
      task.update(
        adapter.scaffolderPin ? `${adapter.label} (${adapter.scaffolderPin})` : adapter.label,
      );
      try {
        await adapter.scaffold(makeAppCtx(rc, adapter));
      } catch (err) {
        throw toScaffoldError(err, 'scaffold-apps', adapter.id);
      }
    }
  },
};
