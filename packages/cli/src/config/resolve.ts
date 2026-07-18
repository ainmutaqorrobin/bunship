import { basename, resolve as resolvePath } from 'node:path';

import { BIN_NAME } from '../branding';
import { UsageError } from '../errors';
import { canonicalizePath } from '../fsx';
import { collectInteractive } from '../prompts';
import {
  type ApiStack,
  type MobileStack,
  type ProjectConfig,
  type WebStack,
  YES_DEFAULTS,
} from './schema';
import { validateConfig } from './validate';

/** Raw commander option values (undefined = not passed; commander defaults git/install to true). */
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

function noneToNull<T extends string>(value: string | undefined): T | null | undefined {
  if (value === undefined) return undefined;
  return value === 'none' ? null : (value as T);
}

export async function resolveConfig(
  dirArg: string | undefined,
  flags: RawFlags,
): Promise<ProjectConfig> {
  const output: ProjectConfig['output'] = flags.json ? 'json' : 'pretty';
  const interactive =
    !flags.json && !flags.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;

  let dir = dirArg;
  let web = noneToNull<WebStack>(flags.web);
  let mobile = noneToNull<MobileStack>(flags.mobile);
  let api = noneToNull<ApiStack>(flags.api);
  let docker = flags.docker;
  let cicd = flags.cicd;

  if (interactive) {
    const answers = await collectInteractive(
      {
        dirArg,
        web: flags.web as WebStack | 'none' | undefined,
        mobile: flags.mobile as MobileStack | 'none' | undefined,
        api: flags.api as ApiStack | 'none' | undefined,
        docker,
        cicd,
      },
      BIN_NAME,
    );
    dir = answers.dir;
    web = answers.web === 'none' ? null : answers.web;
    mobile = answers.mobile === 'none' ? null : answers.mobile;
    api = answers.api === 'none' ? null : answers.api;
    docker = answers.docker;
    cicd = answers.cicd;
  } else {
    if (!dir) {
      throw new UsageError(
        `Target directory is required in non-interactive mode, e.g. \`${BIN_NAME} my-app --web next --api nest --json\`.`,
      );
    }
    if (flags.yes) {
      web = web === undefined ? YES_DEFAULTS.web : web;
      mobile = mobile === undefined ? YES_DEFAULTS.mobile : mobile;
      api = api === undefined ? YES_DEFAULTS.api : api;
      docker ??= YES_DEFAULTS.docker;
      cicd ??= YES_DEFAULTS.cicd;
    } else {
      // Strict agent mode: anything not stated is off (docker resolves below,
      // AFTER the cicd implication — `--cicd` alone must imply docker, not conflict).
      web ??= null;
      mobile ??= null;
      api ??= null;
      cicd ??= false;
    }
  }

  if (cicd && docker === false) {
    throw new UsageError('--cicd requires Docker; drop --no-docker or drop --cicd.');
  }
  if (cicd) docker = true;
  docker ??= false;

  const targetDir = canonicalizePath(resolvePath(process.cwd(), dir ?? '.'));
  const projectName = (flags.name ?? basename(targetDir)).toLowerCase();

  const cfg: ProjectConfig = {
    projectName,
    targetDir,
    stacks: { web: web ?? null, mobile: mobile ?? null, api: api ?? null },
    docker: docker ?? false,
    cicd: cicd ?? false,
    git: flags.git,
    install: flags.install,
    output,
    dryRun: flags.dryRun === true,
    force: flags.force === true,
    keepOnError: flags.keepOnError === true,
    verbose: flags.verbose === true,
  };
  validateConfig(cfg);
  return cfg;
}
