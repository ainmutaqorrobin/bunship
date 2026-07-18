import { makeAppCtx } from '../context';
import { toScaffoldError } from '../errors';
import { selectedAdapters } from '../stacks/registry';
import { ensureAppPackageJson, universalCleanup } from '../stacks/shared';
import type { Step } from './types';

export const postProcess: Step = {
  id: 'post-process',
  title: 'Normalizing apps for the monorepo',
  enabled: () => true,
  async run(rc, task) {
    for (const adapter of selectedAdapters(rc.cfg)) {
      task.update(adapter.label);
      const ctx = makeAppCtx(rc, adapter);
      try {
        await universalCleanup(ctx);
        await adapter.postProcess?.(ctx);
        await ensureAppPackageJson(ctx, adapter);
      } catch (err) {
        throw toScaffoldError(err, 'post-process', adapter.id);
      }
      rc.apps.push({
        stack: adapter.id,
        kind: adapter.kind,
        dir: adapter.dirName,
        pkgName: ctx.pkgName,
        devPort: adapter.devPort,
        dockerfile: rc.cfg.docker && adapter.docker ? `${ctx.relDir}/Dockerfile` : null,
      });
    }
  },
};
