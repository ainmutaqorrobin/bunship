#!/usr/bin/env node
import { createRequire } from 'node:module';

import { Command, Option } from 'commander';

import { BIN_NAME } from './branding';
import { run } from './run';
import { selftest } from './selftest';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name(BIN_NAME)
  .description('Scaffold a production-ready Bun monorepo using official framework scaffolders')
  .version(version, '-v, --version')
  .argument('[dir]', 'target directory (doubles as the project name unless --name is given)')
  .option('--name <name>', 'project name (npm-style)')
  .addOption(
    new Option('--web <stack>', 'web frontend').choices(['next', 'react-vite', 'nuxt', 'none']),
  )
  .addOption(new Option('--mobile <stack>', 'mobile app').choices(['expo', 'none']))
  .addOption(
    new Option('--api <stack>', 'API backend').choices([
      'nest',
      'express',
      'hono',
      'fastify',
      'none',
    ]),
  )
  .option('--docker', 'generate Dockerfiles + docker compose')
  .option('--no-docker', 'skip Docker')
  .option('--cicd', 'generate GitHub Actions CI + VPS deploy workflows (implies --docker)')
  .option('--no-cicd', 'skip CI/CD workflows')
  .option('--no-git', 'skip git init/commit (also skips husky hooks)')
  .option('--no-install', 'skip bun install')
  .option('--json', 'agent mode: non-interactive, prints a machine-readable manifest on stdout')
  .option('-y, --yes', 'non-interactive with defaults (next + nest + docker + cicd)')
  .option('--dry-run', 'resolve config and print the manifest without writing anything')
  .option('--force', 'allow scaffolding into a non-empty directory')
  .option('--keep-on-error', 'do not delete the target directory when a step fails')
  .option('--verbose', 'stream child process output')
  .addOption(new Option('--selftest', 'verify the built bundle').hideHelp())
  .action(async (dir: string | undefined, opts: Record<string, unknown>) => {
    if (opts['selftest']) {
      selftest();
      return;
    }
    await run(dir, opts as never, program);
  });

await program.parseAsync(process.argv);
