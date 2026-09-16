import { join } from 'node:path';

import { exec } from '../exec';
import { pathExists } from '../fsx';
import {
  groupBySource,
  plannedSkills,
  SKILLS_CLI_PIN,
  SKILLS_LOCK_FILE,
  skillDirs,
  skillsCliAgentKeys,
} from '../skills';
import { resolvePin } from '../stacks/shared';
import type { Step } from './types';

// Each source is a git clone of a public repo; the largest (anthropics/skills) is tens of MB.
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

// ANSI colour codes plus clack's guide/step glyphs, so a warning reads as plain text.
// eslint-disable-next-line no-control-regex -- the ESC byte is the point
const DECORATION_RE = /\u001B\[[0-9;?]*[A-Za-z]|^[\s│┌└├■●◇◆▲✓✗○◒◐◓◑]+/g;

/**
 * The root cause is the FIRST failure line the skills CLI prints ("Failed to clone
 * repository", "No matching skills found for: x"); everything after it is advice and a
 * generic "Installation failed" footer.
 */
function failureReason(err: unknown): string {
  const lines = ((err as { tail?: string[] }).tail ?? []).map((l) =>
    l.replaceAll(DECORATION_RE, '').trim(),
  );
  const cause = lines.find((l) => /fail|error|no matching|not found|denied|timeout/i.test(l));
  return cause ?? lines.at(-1) ?? (err instanceof Error ? err.message : String(err));
}

/**
 * Installs the planned SKILL.md packs by driving the skills CLI once per source repo —
 * the same "official scaffolder, not vendored boilerplate" rule the apps follow, so a
 * generated repo carries whatever the skill's maintainer ships today.
 *
 * Runs BEFORE `tooling`, which writes the AGENTS.md skills table and the
 * oxfmt/oxlint/knip ignores from `rc.agentSkills` — i.e. from what actually landed.
 * A third-party repo renaming a directory must not cost the user the whole scaffold,
 * so failures here degrade to a warning plus a `failed` entry in the manifest.
 */
export const agentSkills: Step = {
  id: 'agent-skills',
  title: 'Installing agent skills (skills.sh)',
  enabled: (cfg) => cfg.skills.length > 0 && cfg.agents.length > 0,
  async run(rc, task) {
    const { cfg } = rc;
    const root = cfg.targetDir;
    const skills = plannedSkills(cfg);
    const agentKeys = skillsCliAgentKeys(cfg.agents);
    const dirs = skillDirs(cfg.agents);
    const cli = resolvePin(SKILLS_CLI_PIN);

    const failed: Array<{ name: string; source: string; reason: string }> = [];
    for (const [source, refs] of groupBySource(skills)) {
      task.update(`${source} (${cli})`);
      try {
        // --copy is load-bearing: the default symlink mode needs Developer Mode or admin
        // on Windows, and without it the CLI exits 0 while silently writing nothing for
        // Claude Code and Windsurf. -a/-s are space-separated variadics (commas are rejected).
        await exec(
          'bunx',
          [
            cli,
            'add',
            source,
            '-s',
            ...refs.map((r) => r.name),
            '-a',
            ...agentKeys,
            '-y',
            '--copy',
          ],
          { cwd: root, verbose: cfg.verbose, timeoutMs: INSTALL_TIMEOUT_MS },
        );
      } catch (err) {
        // Whole source unreachable (repo gone/renamed, offline) or none of the names matched.
        const reason = failureReason(err);
        for (const r of refs) failed.push({ name: r.name, source, reason });
        rc.report.warn(`Skills from ${source} were not installed: ${reason}`);
      }
    }

    // The CLI reports success per skill it *matched*: a renamed skill among valid ones is
    // dropped with exit 0, so check the output exists everywhere an agent will look.
    const failedNames = new Set(failed.map((f) => f.name));
    const installed: Array<{ name: string; source: string }> = [];
    for (const s of skills) {
      if (failedNames.has(s.name)) continue;
      const missingIn: string[] = [];
      for (const dir of dirs) {
        if (!(await pathExists(join(root, dir, s.name, 'SKILL.md')))) missingIn.push(dir);
      }
      if (missingIn.length === 0) {
        installed.push({ name: s.name, source: s.source });
        continue;
      }
      const reason = `not found in https://github.com/${s.source} (renamed upstream?) — missing under ${missingIn.join(', ')}`;
      failed.push({ name: s.name, source: s.source, reason });
      rc.report.warn(`Skill ${s.name} was not installed: ${reason}`);
    }

    if (failed.length > 0) {
      rc.report.warn(
        `${String(failed.length)} of ${String(skills.length)} skills missing — see \`agentSkills.failed\`; retry later with \`bunx ${cli} add <source> --skill <name>\`.`,
      );
    }

    rc.agentSkills = { packs: cfg.skills, installed, failed, dirs, lock: SKILLS_LOCK_FILE };
  },
};
