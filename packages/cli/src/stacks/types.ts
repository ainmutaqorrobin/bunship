import type { ProjectConfig, StackId } from '../config/schema';
import type { Reporter } from '../reporter/types';

/** Declarative contributions an adapter makes to root-level files (aggregated by steps). */
interface ToolingFragment {
  oxlintPlugins?: string[];
  /** Rule overrides merged into the generated .oxlintrc.json `rules` object. */
  oxlintRules?: Record<string, unknown>;
  /** File-scoped entries appended to the generated .oxlintrc.json `overrides` array. */
  oxlintOverrides?: Array<Record<string, unknown>>;
  /** Merged into knip.json under `workspaces["apps/<dir>"]`. Empty object = plugins auto-detect. */
  knipWorkspace?: Record<string, unknown>;
  /** Metro/Expo needs a flat node_modules; forces bunfig `linker = "hoisted"`. */
  hoistedLinker?: boolean;
  gitignore?: string[];
  /** Extra file extensions oxfmt should cover in lint-staged (e.g. "vue"). */
  formatExtensions?: string[];
}

interface DockerSpec {
  /** Filename inside templates/docker/. */
  template: string;
  containerPort: number;
  hostPort: number;
  healthPath: string;
  vars?: Record<string, string>;
}

export interface AppCtx {
  cfg: ProjectConfig;
  /** Repo root (= cfg.targetDir). Adapters must never write outside appDir. */
  root: string;
  appDir: string;
  /** POSIX-style path relative to root, e.g. "apps/web". */
  relDir: string;
  pkgName: string;
  verbose: boolean;
  report: Reporter;
}

export interface StackAdapter {
  id: StackId;
  kind: 'web' | 'mobile' | 'api';
  label: string;
  dirName: string;
  devPort: number | null;
  /** Exact-pinned official scaffolder package (e.g. "create-next-app@16"); null = internal template. */
  scaffolderPin: string | null;
  /**
   * Minimum Node this framework's own CLI needs at dev/build time. Framework binaries
   * run under node via their bin shebang — NOT under bun — so bun's version says
   * nothing about whether `nuxt build` will work.
   *
   * A plain floor rather than the upstream semver range (`^22.19 || ^24.11`): matching
   * ranges properly would mean taking a semver dependency, and this package ships zero.
   * Floors only ever rise, so a stale value errs toward letting a build through, never
   * toward blocking a setup that works.
   */
  minNode?: string;
  /** Materialize appDir by running the official scaffolder (or copying the internal template). */
  scaffold(ctx: AppCtx): Promise<void>;
  /** Framework-specific fixups. Runs AFTER the step-owned universal cleanup. */
  postProcess?(ctx: AppCtx): Promise<void>;
  /** Scripts ensured (added only if missing) in the app's package.json. */
  scripts: Partial<Record<'dev' | 'build' | 'start' | 'typecheck', string>>;
  tooling: ToolingFragment;
  /** Undefined = no container for this app (e.g. Expo). */
  docker?: DockerSpec;
}
