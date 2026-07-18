import type { ProjectConfig } from '../config/schema';
import type { RunContext } from '../context';
import type { TaskHandle } from '../reporter/types';

export interface Step {
  id: string;
  title: string;
  enabled(cfg: ProjectConfig): boolean;
  run(rc: RunContext, task: TaskHandle): Promise<void>;
}
