import type { AgentId } from './config/schema';

/** Root-relative path of the shared hook script every agent config points at. */
export const AGENT_FORMAT_SCRIPT = 'scripts/agent-format.ts';

// One command for every agent and every OS: `bun` is a hard requirement of generated
// repos, and a bare `bun <script>` needs no shell features, so it runs unchanged under
// bash, cmd, and PowerShell — Copilot even asks for both variants.
const COMMAND = `bun ${AGENT_FORMAT_SCRIPT}`;

/** A file an agent hook writes at the repo root, serialized as JSON. */
interface AgentHookFile {
  path: string;
  content: Record<string, unknown>;
}

export interface AgentHook {
  id: AgentId;
  label: string;
  /** Prompt hint: how the agent runs the hook. */
  hint: string;
  files: AgentHookFile[];
  /** Root .gitignore lines this agent needs. */
  gitignore?: string[];
}

/**
 * Each entry mirrors that agent's documented hook contract. All of them pipe a JSON
 * description of the edit to the command on stdin; the shapes differ (Claude/Gemini:
 * `tool_input.file_path`, Cursor: `file_path`, Windsurf: `tool_info.file_path`,
 * Copilot: `toolArgs` as a JSON string, Codex: an apply_patch body) — the shared script
 * handles all of them, so the configs stay trivial pointers.
 */
export const AGENT_HOOKS: Record<AgentId, AgentHook> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    hint: '.claude/settings.json PostToolUse',
    files: [
      {
        path: '.claude/settings.json',
        content: {
          hooks: {
            PostToolUse: [
              {
                // Unanchored regex: also catches MultiEdit / NotebookEdit; the script
                // skips anything it cannot format.
                matcher: 'Edit|Write',
                hooks: [{ type: 'command', command: COMMAND, timeout: 30 }],
              },
            ],
          },
        },
      },
    ],
    // Per-user permission grants land here; never commit them.
    gitignore: ['.claude/settings.local.json'],
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    hint: '.cursor/hooks.json afterFileEdit',
    files: [
      {
        path: '.cursor/hooks.json',
        content: { version: 1, hooks: { afterFileEdit: [{ command: COMMAND }] } },
      },
    ],
  },
  copilot: {
    id: 'copilot',
    label: 'GitHub Copilot',
    hint: '.github/hooks/format.json postToolUse (CLI + coding agent)',
    files: [
      {
        path: '.github/hooks/format.json',
        content: {
          version: 1,
          hooks: {
            postToolUse: [
              {
                type: 'command',
                matcher: 'edit|create',
                bash: COMMAND,
                powershell: COMMAND,
                timeoutSec: 30,
              },
            ],
          },
        },
      },
    ],
  },
  codex: {
    id: 'codex',
    label: 'OpenAI Codex',
    hint: '.codex/hooks.json PostToolUse',
    files: [
      {
        path: '.codex/hooks.json',
        content: {
          hooks: {
            PostToolUse: [
              {
                // Codex edits files through apply_patch; the touched paths are only in
                // the patch body, which the script parses.
                matcher: 'apply_patch',
                hooks: [{ type: 'command', command: COMMAND, timeout: 30 }],
              },
            ],
          },
        },
      },
    ],
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    hint: '.gemini/settings.json AfterTool',
    files: [
      {
        path: '.gemini/settings.json',
        content: {
          hooks: {
            AfterTool: [
              {
                matcher: 'write_file|replace',
                hooks: [
                  {
                    name: 'format-edited-file',
                    type: 'command',
                    command: COMMAND,
                    // Gemini's timeout is milliseconds, unlike the others.
                    timeout: 30_000,
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  },
  windsurf: {
    id: 'windsurf',
    label: 'Windsurf',
    hint: '.windsurf/hooks.json post_write_code',
    files: [
      {
        path: '.windsurf/hooks.json',
        content: { hooks: { post_write_code: [{ command: COMMAND, show_output: false }] } },
      },
    ],
  },
};

/** Selected hooks in AGENT_IDS order, regardless of how the user listed them. */
export function selectedAgentHooks(agents: readonly AgentId[]): AgentHook[] {
  const chosen = new Set(agents);
  return Object.values(AGENT_HOOKS).filter((h) => chosen.has(h.id));
}
