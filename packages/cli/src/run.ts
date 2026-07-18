import type { Command } from 'commander';

export interface RawFlags {
  name?: string;
  web?: string;
  mobile?: string;
  api?: string;
  docker?: boolean;
  cicd?: boolean;
  git: boolean;
  install: boolean;
  json?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  force?: boolean;
  keepOnError?: boolean;
  verbose?: boolean;
}

export async function run(
  dir: string | undefined,
  flags: RawFlags,
  program: Command,
): Promise<void> {
  // Pipeline lands in M2.
  void dir;
  void flags;
  void program;
  console.error('The generation pipeline is not implemented yet (M2).');
  process.exitCode = 1;
}
