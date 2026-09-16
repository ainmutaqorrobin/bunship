import { describe, expect, test } from 'bun:test';

import { AGENT_IDS, SKILL_PACK_IDS } from '../../src/config/schema';
import { EXTRA_SKILL_PACKS, groupBySource, plannedSkills, skillDirs } from '../../src/skills';
import { selectedAdapters } from '../../src/stacks/registry';

// Agent Skills spec: 1-64 chars, lowercase alphanumerics and single hyphens, and the
// directory name must equal the SKILL.md name — so this is also what the CLI matches on.
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GITHUB_SOURCE_RE = /^[\w.-]+\/[\w.-]+$/;

const WEB = ['next', 'react-vite', 'nuxt'] as const;
const API = ['nest', 'express', 'hono', 'fastify'] as const;

describe('skills registry', () => {
  test('every adapter declares at least one well-formed skill', () => {
    const adapters = [
      ...WEB.map((web) => selectedAdapters({ stacks: { web, mobile: null, api: null } })[0]!),
      ...API.map((api) => selectedAdapters({ stacks: { web: null, mobile: null, api } })[0]!),
      selectedAdapters({ stacks: { web: null, mobile: 'expo', api: null } })[0]!,
    ];
    for (const adapter of adapters) {
      expect(adapter.skills.length).toBeGreaterThan(0);
      for (const s of adapter.skills) {
        expect(s.name).toMatch(SKILL_NAME_RE);
        expect(s.name.length).toBeLessThanOrEqual(64);
        expect(s.source).toMatch(GITHUB_SOURCE_RE);
        expect(s.by.length).toBeGreaterThan(0);
        expect(s.about.length).toBeGreaterThan(0);
      }
    }
  });

  test('extra packs cover every non-stack id', () => {
    for (const id of SKILL_PACK_IDS) {
      if (id === 'stack') continue;
      expect(EXTRA_SKILL_PACKS[id].skills.length).toBeGreaterThan(0);
    }
  });

  test('plannedSkills honours the pack selection', () => {
    const cfg = { stacks: { web: 'next' as const, mobile: null, api: null } };
    expect(plannedSkills({ ...cfg, skills: [] })).toEqual([]);
    expect(plannedSkills({ ...cfg, skills: ['web-design'] }).map((s) => s.name)).toEqual([
      'web-design-guidelines',
    ]);
    expect(
      plannedSkills({ ...cfg, skills: ['stack', 'frontend-design'] }).map((s) => s.name),
    ).toEqual(['vercel-react-best-practices', 'frontend-design']);
  });

  test('plannedSkills never lists a name twice', () => {
    for (const web of WEB) {
      for (const api of API) {
        const names = plannedSkills({
          stacks: { web, mobile: 'expo', api },
          skills: [...SKILL_PACK_IDS],
        }).map((s) => s.name);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });

  test('groupBySource yields one clone per repo, preserving order', () => {
    const groups = groupBySource(
      plannedSkills({
        stacks: { web: 'react-vite', mobile: null, api: 'fastify' },
        skills: ['stack', 'web-design'],
      }),
    );
    expect([...groups.keys()]).toEqual(['vercel-labs/agent-skills', 'mcollina/skills']);
    expect(groups.get('vercel-labs/agent-skills')?.map((s) => s.name)).toEqual([
      'vercel-react-best-practices',
      'vercel-composition-patterns',
      'web-design-guidelines',
    ]);
  });

  test('skillDirs: shared .agents dir for the universal agents, own dir for the rest', () => {
    expect(skillDirs(['claude'])).toEqual(['.claude/skills']);
    expect(skillDirs(['cursor', 'codex', 'copilot', 'gemini'])).toEqual(['.agents/skills']);
    expect(skillDirs([...AGENT_IDS])).toEqual([
      '.agents/skills',
      '.claude/skills',
      '.windsurf/skills',
    ]);
  });
});
