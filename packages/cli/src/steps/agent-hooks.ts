import { join } from 'node:path';

import { AGENT_FORMAT_SCRIPT, selectedAgentHooks } from '../agents';
import { writeJson } from '../fsx';
import { copyTemplate } from '../template';
import type { Step } from './types';

/**
 * Writes one shared format/lint script plus a tiny per-agent hook config pointing at it,
 * so every edit an AI agent makes is already oxlint --fix'd and oxfmt'd before a human
 * runs `bun run check`. Runs after `tooling`, which owns the extension list the script
 * mirrors and the knip/.gitignore entries these files need.
 */
export const agentHooks: Step = {
  id: 'agent-hooks',
  title: 'Writing AI agent format-on-edit hooks',
  enabled: (cfg) => cfg.agents.length > 0,
  async run(rc, task) {
    const root = rc.cfg.targetDir;
    const hooks = selectedAgentHooks(rc.cfg.agents);

    task.update(AGENT_FORMAT_SCRIPT);
    await copyTemplate('agent-hooks/agent-format.ts.tpl', join(root, AGENT_FORMAT_SCRIPT), {
      // Regex alternation of the oxfmt-only extensions tooling settled on (json, md, vue, …).
      formatExts: rc.formatExtensions.join('|'),
    });

    const files: string[] = [];
    for (const hook of hooks) {
      task.update(hook.label);
      for (const file of hook.files) {
        await writeJson(join(root, file.path), file.content);
        files.push(file.path);
      }
    }

    rc.agentHooks = { agents: hooks.map((h) => h.id), script: AGENT_FORMAT_SCRIPT, files };
  },
};
