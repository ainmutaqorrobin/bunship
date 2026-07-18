import type { RunContext } from '../context';
import { toScaffoldError, UsageError } from '../errors';
import { cicd } from './cicd';
import { docker } from './docker';
import { finalize } from './finalize';
import { postProcess } from './post-process';
import { preflight } from './preflight';
import { scaffoldApps } from './scaffold-apps';
import { scaffoldRoot } from './scaffold-root';
import { tooling } from './tooling';
import type { Step } from './types';

const STEPS: Step[] = [
  preflight,
  scaffoldRoot,
  scaffoldApps,
  postProcess,
  tooling,
  docker,
  cicd,
  finalize,
];

export async function runPipeline(rc: RunContext): Promise<void> {
  for (const step of STEPS) {
    if (!step.enabled(rc.cfg)) continue;
    const task = rc.report.task(step.title);
    try {
      await step.run(rc, task);
      task.succeed();
    } catch (err) {
      task.fail();
      if (err instanceof UsageError) throw err;
      throw toScaffoldError(err, step.id);
    }
  }
}
