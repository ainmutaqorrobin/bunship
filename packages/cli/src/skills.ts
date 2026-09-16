import type { AgentId, ProjectConfig, SkillPackId } from './config/schema';
import { selectedAdapters } from './stacks/registry';

/**
 * Vercel's `skills` CLI (skills.sh) is the "official scaffolder" for skills: it resolves
 * a GitHub repo, picks the named SKILL.md directories and writes them where each agent
 * discovers them. Major-pinned like the framework scaffolders; `resolvePin` strips it
 * under SCAFFOLDER_CANARY so the nightly catches a breaking CLI change first.
 */
export const SKILLS_CLI_PIN = 'skills@1';

/** Written by the skills CLI at the repo root; hashes let `bunx skills update` diff upstream. */
export const SKILLS_LOCK_FILE = 'skills-lock.json';

/** One installable skill: a directory with a SKILL.md inside a public GitHub repo. */
export interface SkillRef {
  /** `owner/repo` on GitHub, exactly as the skills CLI takes it. */
  source: string;
  /** Directory name (= SKILL.md `name`); must match the upstream name byte for byte. */
  name: string;
  /** Who maintains it — surfaced in AGENTS.md so a reader can judge how much to trust it. */
  by: string;
  /** One line, for AGENTS.md: what it covers and when an agent should load it. */
  about: string;
}

interface SkillPack {
  id: SkillPackId;
  label: string;
  /** Prompt hint: the advantage of switching it on. */
  hint: string;
  skills: SkillRef[];
}

/**
 * Stack-independent packs the prompt offers alongside the per-adapter `stack` set. Kept
 * to two deliberately: both are Vercel/Anthropic-maintained and stack-agnostic, and each
 * adds ~80 files per agent copy — a skill nobody asked for is context an agent pays for.
 */
export const EXTRA_SKILL_PACKS: Record<Exclude<SkillPackId, 'stack'>, SkillPack> = {
  'web-design': {
    id: 'web-design',
    label: 'Web design guidelines',
    hint: 'accessibility + UX audit rules; "review my UI" gets a real checklist',
    skills: [
      {
        source: 'vercel-labs/agent-skills',
        name: 'web-design-guidelines',
        by: 'Vercel',
        about:
          'Web Interface Guidelines: 100+ accessibility, UX and interaction rules. Load when reviewing or auditing UI.',
      },
    ],
  },
  'frontend-design': {
    id: 'frontend-design',
    label: 'Frontend design',
    hint: 'opinionated visual direction for new UI instead of template defaults',
    skills: [
      {
        source: 'anthropics/skills',
        name: 'frontend-design',
        by: 'Anthropic',
        about:
          'Distinctive, intentional visual design (typography, colour, layout) for new or reshaped UI.',
      },
    ],
  },
};

/**
 * How the skills CLI names each agent and where it puts the copy. Cursor, Codex, Copilot
 * and Gemini all read the shared `.agents/skills/`; Claude Code and Windsurf only read
 * their own directory, so those get a second physical copy.
 */
const SKILLS_CLI_AGENT: Record<AgentId, { key: string; dir: string }> = {
  claude: { key: 'claude-code', dir: '.claude/skills' },
  cursor: { key: 'cursor', dir: '.agents/skills' },
  copilot: { key: 'github-copilot', dir: '.agents/skills' },
  codex: { key: 'codex', dir: '.agents/skills' },
  gemini: { key: 'gemini-cli', dir: '.agents/skills' },
  windsurf: { key: 'windsurf', dir: '.windsurf/skills' },
};

export function skillsCliAgentKeys(agents: readonly AgentId[]): string[] {
  return agents.map((id) => SKILLS_CLI_AGENT[id].key);
}

/** Distinct root-relative directories the selected agents read skills from. */
export function skillDirs(agents: readonly AgentId[]): string[] {
  return [...new Set(agents.map((id) => SKILLS_CLI_AGENT[id].dir))].toSorted();
}

/**
 * Every skill a run installs: the selected adapters' own sets when `stack` is on, plus
 * any extra packs. De-duplicated by name — react-vite and next share Vercel's React
 * skill, and the CLI would refuse to install the same name twice anyway.
 */
export function plannedSkills(cfg: Pick<ProjectConfig, 'stacks' | 'skills'>): SkillRef[] {
  const out: SkillRef[] = [];
  const seen = new Set<string>();
  const push = (ref: SkillRef): void => {
    if (seen.has(ref.name)) return;
    seen.add(ref.name);
    out.push(ref);
  };
  if (cfg.skills.includes('stack')) {
    for (const adapter of selectedAdapters(cfg)) adapter.skills.forEach(push);
  }
  for (const id of cfg.skills) {
    if (id === 'stack') continue;
    EXTRA_SKILL_PACKS[id].skills.forEach(push);
  }
  return out;
}

/** Skills grouped by source repo — one skills CLI invocation (one clone) per repo. */
export function groupBySource(skills: readonly SkillRef[]): Map<string, SkillRef[]> {
  const groups = new Map<string, SkillRef[]>();
  for (const s of skills) {
    const list = groups.get(s.source) ?? [];
    list.push(s);
    groups.set(s.source, list);
  }
  return groups;
}
