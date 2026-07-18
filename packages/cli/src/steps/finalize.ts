import { BIN_NAME } from '../branding';
import { exec } from '../exec';
import type { Step } from './types';

const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;

export const finalize: Step = {
  id: 'finalize',
  title: 'Finalizing (git, install, first commit)',
  enabled: () => true,
  async run(rc, task) {
    const { cfg } = rc;
    const cwd = cfg.targetDir;

    // Order matters: husky's `prepare` script (run by bun install) requires .git to exist.
    if (cfg.git) {
      task.update('git init');
      await exec('git', ['init', '-b', 'main'], { cwd });
      rc.git.initialized = true;
    }

    if (cfg.install) {
      task.update('bun install (first install can take a minute)');
      await exec('bun', ['install'], { cwd, verbose: cfg.verbose, timeoutMs: INSTALL_TIMEOUT_MS });

      // Scaffolders ship their own formatting style; normalize once so the repo
      // passes `bun run check` from its very first commit.
      task.update('formatting (oxfmt)');
      try {
        await exec('bun', ['run', 'format'], { cwd });
      } catch {
        rc.report.warn('oxfmt failed — run `bun run format` manually.');
      }
    } else {
      rc.report.warn('--no-install: run `bun install && bun run format` before the first commit.');
    }

    if (cfg.git) {
      task.update('initial commit');
      await exec('git', ['add', '-A'], { cwd });
      try {
        // --no-verify: the initial commit must be verbatim scaffolder output; hooks
        // guard the user's own commits from here on.
        await exec(
          'git',
          ['commit', '--no-verify', '-m', `chore: scaffold ${cfg.projectName} with ${BIN_NAME}`],
          { cwd },
        );
        rc.git.committed = true;
      } catch {
        rc.report.warn(
          'Could not create the initial commit (is your git user.name/user.email configured?). Files are staged — commit manually.',
        );
      }
    }
  },
};
