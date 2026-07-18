import { ScaffoldError, UsageError } from '../errors';
import { exec } from '../exec';
import { dirState } from '../fsx';
import type { Step } from './types';

export const preflight: Step = {
  id: 'preflight',
  title: 'Preflight checks',
  enabled: () => true,
  async run(rc, task) {
    // Inspect the target dir FIRST so the on-error cleanup policy is always accurate.
    task.update('target directory');
    const state = await dirState(rc.cfg.targetDir);
    if (state === 'nonempty' && !rc.cfg.force) {
      throw new UsageError(
        `Target directory is not empty: ${rc.cfg.targetDir} (use --force to scaffold anyway).`,
      );
    }
    rc.createdTargetDir = state === 'missing';

    task.update('bun');
    let bunVersion: string;
    try {
      bunVersion = (await exec('bun', ['--version'], { cwd: process.cwd() })).stdout.trim();
    } catch {
      throw new ScaffoldError('bun was not found on PATH.', {
        step: 'preflight',
        hint: 'Install Bun 1.3+: https://bun.com/docs/installation',
      });
    }
    const [major = 0, minor = 0] = bunVersion.split('.').map(Number);
    if (major < 1 || (major === 1 && minor < 3)) {
      throw new ScaffoldError(`bun ${bunVersion} is too old — this generator needs >= 1.3.`, {
        step: 'preflight',
        hint: 'Upgrade with `bun upgrade`.',
      });
    }

    if (rc.cfg.git) {
      task.update('git');
      try {
        await exec('git', ['--version'], { cwd: process.cwd() });
      } catch {
        throw new ScaffoldError('git was not found on PATH.', {
          step: 'preflight',
          hint: 'Install git, or pass --no-git to skip repository setup.',
        });
      }
    }
  },
};
