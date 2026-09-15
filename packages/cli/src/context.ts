import { join } from 'node:path';

import type { ProjectConfig } from './config/schema';
import type { Manifest, ManifestApp } from './manifest';
import type { Reporter } from './reporter/types';
import type { AppCtx, StackAdapter } from './stacks/types';

export interface RunContext {
  cfg: ProjectConfig;
  report: Reporter;
  version: string;
  /** Whether the pipeline created targetDir (drives the on-error cleanup policy). */
  createdTargetDir: boolean;
  apps: ManifestApp[];
  rootScripts: Record<string, string>;
  bunLinker: 'isolated' | 'hoisted';
  /** Extensions oxfmt formats in this repo (set by tooling; agent-hooks mirrors it). */
  formatExtensions: string[];
  docker: Manifest['docker'];
  cicd: Manifest['cicd'];
  agentHooks: Manifest['agentHooks'];
  git: { initialized: boolean; committed: boolean };
}

export function createRunContext(
  cfg: ProjectConfig,
  report: Reporter,
  version: string,
): RunContext {
  return {
    cfg,
    report,
    version,
    createdTargetDir: false,
    apps: [],
    rootScripts: {},
    bunLinker: 'isolated',
    formatExtensions: [],
    docker: null,
    cicd: null,
    agentHooks: null,
    git: { initialized: false, committed: false },
  };
}

export function makeAppCtx(rc: RunContext, adapter: StackAdapter): AppCtx {
  return {
    cfg: rc.cfg,
    root: rc.cfg.targetDir,
    appDir: join(rc.cfg.targetDir, 'apps', adapter.dirName),
    relDir: `apps/${adapter.dirName}`,
    pkgName: `@${rc.cfg.projectName}/${adapter.dirName}`,
    verbose: rc.cfg.verbose,
    report: rc.report,
  };
}
