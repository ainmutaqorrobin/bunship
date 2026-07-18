import type { Manifest } from '../manifest';

export interface TaskHandle {
  update(message: string): void;
  succeed(message?: string): void;
  fail(message?: string): void;
}

export interface Reporter {
  intro(title: string): void;
  task(title: string): TaskHandle;
  info(message: string): void;
  warn(message: string): void;
  /** Terminal summary. In --json mode this is the ONLY thing ever written to stdout. */
  outro(manifest: Manifest): void;
}
