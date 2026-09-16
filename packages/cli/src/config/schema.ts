export type WebStack = 'next' | 'react-vite' | 'nuxt';
export type MobileStack = 'expo';
export type ApiStack = 'nest' | 'express' | 'hono' | 'fastify';
export type StackId = WebStack | MobileStack | ApiStack;

/** Coding agents we can write an after-edit format/lint hook for (see src/agents.ts). */
export const AGENT_IDS = ['claude', 'cursor', 'copilot', 'codex', 'gemini', 'windsurf'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/**
 * Skill packs installable for the selected agents (see src/skills.ts). `stack` is the
 * per-framework best-practice set derived from the chosen adapters; the rest are
 * stack-independent extras.
 */
export const SKILL_PACK_IDS = ['stack', 'web-design', 'frontend-design'] as const;
export type SkillPackId = (typeof SKILL_PACK_IDS)[number];

interface StackSelection {
  web: WebStack | null;
  mobile: MobileStack | null;
  api: ApiStack | null;
}

export interface ProjectConfig {
  /** npm-valid kebab name; also used as the workspace package scope (`@name/web`). */
  projectName: string;
  /** Absolute path of the repo to create. */
  targetDir: string;
  stacks: StackSelection;
  docker: boolean;
  /** Implies docker. */
  cicd: boolean;
  /** Agents to write an after-edit oxlint/oxfmt hook for; empty = none. */
  agents: AgentId[];
  /** Skill packs to install for those agents; empty = none. Requires `agents`. */
  skills: SkillPackId[];
  /** false ⇒ no git init/commit and no husky wiring at all. */
  git: boolean;
  install: boolean;
  output: 'pretty' | 'json';
  dryRun: boolean;
  force: boolean;
  keepOnError: boolean;
  verbose: boolean;
}

/** Applied by `--yes` for anything not given explicitly. */
export const YES_DEFAULTS = {
  web: 'next',
  mobile: null,
  api: 'nest',
  docker: true,
  cicd: true,
  agents: ['claude'] as AgentId[],
  skills: ['stack'] as SkillPackId[],
} as const;

export const PROJECT_NAME_RE = /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/;
