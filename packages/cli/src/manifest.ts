import type { ProjectConfig, StackId } from './config/schema';

export interface ManifestApp {
  stack: StackId;
  kind: 'web' | 'mobile' | 'api';
  dir: string;
  pkgName: string;
  devPort: number | null;
  dockerfile: string | null;
}

export interface Manifest {
  ok: boolean;
  version: string;
  dryRun: boolean;
  projectName: string;
  root: string;
  apps: ManifestApp[];
  tooling: {
    linter: 'oxlint';
    formatter: 'oxfmt';
    knip: true;
    husky: boolean;
    bunLinker: 'isolated' | 'hoisted';
  };
  scripts: Record<string, string>;
  docker: { compose: string; services: string[] } | null;
  cicd: { workflows: string[]; requiredSecrets: string[]; environments: string[] } | null;
  git: { initialized: boolean; committed: boolean };
  nextSteps: string[];
  error?: { step: string; message: string; hint?: string; tail?: string[] };
}

export interface ManifestParts {
  apps: ManifestApp[];
  scripts: Record<string, string>;
  bunLinker: 'isolated' | 'hoisted';
  docker: Manifest['docker'];
  cicd: Manifest['cicd'];
  git: Manifest['git'];
}

export function buildManifest(
  cfg: ProjectConfig,
  version: string,
  parts: ManifestParts,
  ok: boolean,
  error?: Manifest['error'],
): Manifest {
  const nextSteps: string[] = [`cd ${cfg.targetDir}`];
  if (!cfg.install) nextSteps.push('bun install');
  nextSteps.push('bun run dev            # all dev servers (see dev:* for one app)');
  nextSteps.push('bun run check          # lint + format + typecheck + knip');
  if (cfg.docker) nextSteps.push('docker compose up --build   # local prod-parity run');
  if (cfg.cicd) {
    nextSteps.push(
      'Push to GitHub and set the deploy secrets listed under `cicd.requiredSecrets` (see deploy/README.md)',
    );
  }
  return {
    ok,
    version,
    dryRun: cfg.dryRun,
    projectName: cfg.projectName,
    root: cfg.targetDir,
    apps: parts.apps,
    tooling: {
      linter: 'oxlint',
      formatter: 'oxfmt',
      knip: true,
      husky: cfg.git,
      bunLinker: parts.bunLinker,
    },
    scripts: parts.scripts,
    docker: parts.docker,
    cicd: parts.cicd,
    git: parts.git,
    nextSteps,
    ...(error ? { error } : {}),
  };
}
