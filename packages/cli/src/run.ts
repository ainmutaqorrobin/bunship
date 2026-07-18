import { BIN_NAME } from './branding';
import { type RawFlags, resolveConfig } from './config/resolve';
import type { ProjectConfig } from './config/schema';
import { createRunContext, type RunContext } from './context';
import { ScaffoldError, UsageError } from './errors';
import { killActiveChild } from './exec';
import { rimraf } from './fsx';
import { buildManifest, type Manifest, type ManifestParts } from './manifest';
import { createClackReporter } from './reporter/clack';
import { createJsonReporter } from './reporter/json';
import type { Reporter } from './reporter/types';
import { runPipeline } from './steps/pipeline';
import { selectedAdapters } from './stacks/registry';

function partsFrom(rc: RunContext): ManifestParts {
  return {
    apps: rc.apps,
    scripts: rc.rootScripts,
    bunLinker: rc.bunLinker,
    docker: rc.docker,
    cicd: rc.cicd,
    git: rc.git,
  };
}

/** Pure preview of what WOULD be generated — powers --dry-run without touching disk. */
function dryRunManifest(cfg: ProjectConfig, version: string): Manifest {
  const adapters = selectedAdapters(cfg);
  return buildManifest(
    cfg,
    version,
    {
      apps: adapters.map((a) => ({
        stack: a.id,
        kind: a.kind,
        dir: a.dirName,
        pkgName: `@${cfg.projectName}/${a.dirName}`,
        devPort: a.devPort,
        dockerfile: cfg.docker && a.docker ? `apps/${a.dirName}/Dockerfile` : null,
      })),
      scripts: {},
      bunLinker: adapters.some((a) => a.tooling.hoistedLinker) ? 'hoisted' : 'isolated',
      docker: null,
      cicd: null,
      git: { initialized: false, committed: false },
    },
    true,
  );
}

async function cleanupAfterFailure(rc: RunContext, report: Reporter): Promise<void> {
  const { cfg } = rc;
  if (cfg.keepOnError) {
    report.warn(`--keep-on-error: leaving ${cfg.targetDir} in place for inspection.`);
    return;
  }
  if (!rc.createdTargetDir) {
    report.warn(`${cfg.targetDir} existed before this run — leaving its files in place.`);
    return;
  }
  try {
    await rimraf(cfg.targetDir);
    report.info(`Cleaned up ${cfg.targetDir}.`);
  } catch {
    report.warn(`Could not fully clean up ${cfg.targetDir}.`);
  }
}

export async function run(
  dir: string | undefined,
  flags: RawFlags,
  version: string,
): Promise<void> {
  let cfg: ProjectConfig;
  try {
    cfg = await resolveConfig(dir, flags);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  const report: Reporter = cfg.output === 'json' ? createJsonReporter() : createClackReporter();
  const wasInteractive =
    !flags.json && !flags.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;

  if (cfg.dryRun) {
    report.outro(dryRunManifest(cfg, version));
    return;
  }

  const rc = createRunContext(cfg, report, version);

  process.once('SIGINT', () => {
    killActiveChild();
    void (async () => {
      if (!cfg.keepOnError && rc.createdTargetDir)
        await rimraf(cfg.targetDir).catch(() => undefined);
      process.exit(130);
    })();
  });

  // Interactive mode already rendered a clack intro during the prompt flow.
  if (!wasInteractive && cfg.output === 'pretty') report.intro(BIN_NAME);

  try {
    await runPipeline(rc);
    report.outro(buildManifest(cfg, version, partsFrom(rc), true));
  } catch (err) {
    await cleanupAfterFailure(rc, report);
    const usage = err instanceof UsageError;
    const scaffoldErr =
      err instanceof ScaffoldError
        ? err
        : new ScaffoldError(err instanceof Error ? err.message : String(err));
    report.outro(
      buildManifest(cfg, version, partsFrom(rc), false, {
        step: scaffoldErr.meta.step ?? (usage ? 'usage' : 'unknown'),
        message: scaffoldErr.message,
        ...(scaffoldErr.meta.hint ? { hint: scaffoldErr.meta.hint } : {}),
        ...(scaffoldErr.meta.tail && scaffoldErr.meta.tail.length > 0
          ? { tail: scaffoldErr.meta.tail }
          : {}),
      }),
    );
    process.exitCode = usage ? 2 : 1;
  }
}
