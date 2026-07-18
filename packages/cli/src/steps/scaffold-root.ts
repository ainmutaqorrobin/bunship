import { join } from 'node:path';

import { ensureDir } from '../fsx';
import type { Step } from './types';

export const scaffoldRoot: Step = {
  id: 'scaffold-root',
  title: 'Creating monorepo root',
  enabled: () => true,
  async run(rc) {
    // Root files (package.json, configs, hooks) are written by the tooling step,
    // after adapter fragments are known. Here we only materialize the directories.
    await ensureDir(join(rc.cfg.targetDir, 'apps'));
  },
};
