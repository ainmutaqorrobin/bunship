import { ScaffoldError, UsageError } from '../errors';
import { exec } from '../exec';
import { dirState } from '../fsx';
import { meetsMinVersion, nodeBoundStack, nodeFloor } from '../stacks/registry';
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

    // Framework CLIs (nuxt, next, vite, nest) and the skills CLI run under `node` via
    // their bin shebang, so the node on PATH — not bun — decides whether the generated
    // repo can build. Checked here so an unsupported Node fails in a second, rather than
    // surfacing as an upstream stack trace after a multi-minute install.
    //
    // A MISSING node is only fatal for stacks that declare a floor: `bun run` aliases
    // `node` to bun when none is on PATH, so stacks without a floor still run on Bun-only
    // machines. An OLD node is always fatal, because its presence switches that alias off.
    const floor = nodeFloor(rc.cfg);
    task.update('node');
    let nodeVersion: string | null = null;
    try {
      nodeVersion = (await exec('node', ['--version'], { cwd: process.cwd() })).stdout
        .trim()
        .replace(/^v/, '');
    } catch {
      const bound = nodeBoundStack(rc.cfg);
      if (bound) {
        throw new ScaffoldError(
          `node was not found on PATH, but ${bound} runs its CLI under node, not bun.`,
          { step: 'preflight', hint: `Install Node >= ${floor.min}: https://nodejs.org` },
        );
      }
    }
    if (nodeVersion !== null && !meetsMinVersion(nodeVersion, floor.min)) {
      const lowerStack = floor.source === 'stack' ? ', or choose a stack with a lower floor' : '';
      throw new ScaffoldError(
        `Node ${nodeVersion} is too old — ${floor.label} needs Node >= ${floor.min}.`,
        {
          step: 'preflight',
          hint: `Upgrade Node (e.g. \`nvm install ${floor.min.split('.')[0]}\`)${lowerStack}.`,
        },
      );
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
