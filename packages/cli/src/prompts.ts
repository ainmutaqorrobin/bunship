import * as p from '@clack/prompts';

import { AGENT_HOOKS } from './agents';
import type { AgentId, ApiStack, MobileStack, SkillPackId, WebStack } from './config/schema';
import { EXTRA_SKILL_PACKS, plannedSkills } from './skills';

// Some bundlers have dropped clack's `isCancel` runtime export (bombshell-dev/clack#470).
// This module owns all cancel handling; `--selftest` verifies the bundle at build time.
export const clackIsCancelIsReal = typeof p.isCancel === 'function';

const CLACK_CANCEL = Symbol.for('clack:cancel');

export function isCancelSafe(value: unknown): value is symbol {
  return clackIsCancelIsReal ? p.isCancel(value) : value === CLACK_CANCEL;
}

/** Returned by a question when the user pressed Esc: re-ask the previous one. */
const BACK = Symbol('back');

/**
 * clack maps both Esc and Ctrl+C to the same `cancel` action, so a cancelled prompt
 * alone cannot say which key was pressed. readline emits every keypress on stdin before
 * the prompt settles, so remembering the last key name is enough to tell them apart:
 * Esc steps back one question, Ctrl+C still aborts the whole run.
 */
let lastKeyName: string | undefined;
function rememberKey(_char: unknown, key: { name?: string } | undefined): void {
  lastKeyName = key?.name;
}

/** Prompt values use 'none' where the config uses null. */
function pick<T extends string>(v: T | 'none' | undefined): T | null {
  return v === undefined || v === 'none' ? null : v;
}

function cancelRun(): never {
  p.cancel('Cancelled — nothing was written.');
  process.exit(0);
}

async function ask<T>(prompt: () => Promise<T | symbol>): Promise<T | typeof BACK> {
  // Reset BEFORE the prompt exists: its first keypress may arrive synchronously.
  lastKeyName = undefined;
  const value = await prompt();
  if (!isCancelSafe(value)) return value as T;
  if (lastKeyName === 'escape') return BACK;
  return cancelRun();
}

// The `--yes` defaults are the recommendations; every prompt marks its default so a
// first-time user can just press Enter down the list.
const RECOMMENDED = ' (recommended)';
const YES_RECOMMENDED = { active: `Yes${RECOMMENDED}`, inactive: 'No' };

export interface InteractivePre {
  dirArg?: string;
  web?: WebStack | 'none';
  mobile?: MobileStack | 'none';
  api?: ApiStack | 'none';
  docker?: boolean;
  cicd?: boolean;
  agents?: AgentId[];
  skills?: SkillPackId[];
}

export interface InteractiveAnswers {
  dir: string;
  web: WebStack | 'none';
  mobile: MobileStack | 'none';
  api: ApiStack | 'none';
  docker: boolean;
  cicd: boolean;
  agents: AgentId[];
  skills: SkillPackId[];
}

interface Question {
  /** Skip when a flag already answered it — and when stepping back, skip it again. */
  prefilled: boolean;
  /** Skip (and reset to `off`) when an earlier answer makes the question moot. */
  when?: () => boolean;
  off?: () => void;
  ask: () => Promise<unknown>;
}

/** Ask only for what the CLI flags did not already provide. Esc re-asks the previous one. */
export async function collectInteractive(
  pre: InteractivePre,
  intro: string,
): Promise<InteractiveAnswers> {
  p.intro(intro);
  p.log.message('Esc goes back a question · Ctrl+C quits');
  process.stdin.on('keypress', rememberKey);

  // Previous answers seed `initialValue` so stepping back lands on what was chosen.
  const a: Partial<InteractiveAnswers> = {
    dir: pre.dirArg,
    web: pre.web,
    mobile: pre.mobile,
    api: pre.api,
    docker: pre.docker,
    cicd: pre.cicd,
    agents: pre.agents,
    skills: pre.skills,
  };
  const answer = async <K extends keyof InteractiveAnswers>(
    key: K,
    prompt: () => Promise<InteractiveAnswers[K] | symbol>,
  ): Promise<unknown> => {
    const value = await ask(prompt);
    if (value !== BACK) a[key] = value;
    return value;
  };

  const questions: Question[] = [
    {
      prefilled: pre.dirArg !== undefined,
      ask: () =>
        answer('dir', () =>
          p.text({
            message: 'Where should the project be created?',
            placeholder: 'my-startup',
            initialValue: a.dir,
            validate: (v) => (!v || v.trim() === '' ? 'A directory name is required.' : undefined),
          }),
        ),
    },
    {
      prefilled: pre.web !== undefined,
      ask: () =>
        answer('web', () =>
          p.select<WebStack | 'none'>({
            message: 'Web frontend?',
            initialValue: a.web ?? 'next',
            options: [
              { value: 'next', label: `Next.js${RECOMMENDED}`, hint: 'React, SSR, App Router' },
              { value: 'react-vite', label: 'React + Vite', hint: 'SPA' },
              { value: 'nuxt', label: 'Nuxt', hint: 'Vue, SSR' },
              { value: 'none', label: 'None' },
            ],
          }),
        ),
    },
    {
      prefilled: pre.mobile !== undefined,
      ask: () =>
        answer('mobile', () =>
          p.select<MobileStack | 'none'>({
            message: 'Mobile app?',
            initialValue: a.mobile ?? 'none',
            options: [
              {
                value: 'none',
                label: `None${RECOMMENDED}`,
                hint: 'web + API first; mobile can wait',
              },
              { value: 'expo', label: 'Expo', hint: 'React Native + expo-router' },
            ],
          }),
        ),
    },
    {
      prefilled: pre.api !== undefined,
      ask: () =>
        answer('api', () =>
          p.select<ApiStack | 'none'>({
            message: 'API backend?',
            initialValue: a.api ?? 'nest',
            options: [
              {
                value: 'nest',
                label: `NestJS${RECOMMENDED}`,
                hint: 'structured, batteries included',
              },
              { value: 'hono', label: 'Hono', hint: 'ultralight, Bun-native' },
              { value: 'express', label: 'Express', hint: 'the classic' },
              { value: 'fastify', label: 'Fastify', hint: 'fast, schema-driven' },
              { value: 'none', label: 'None' },
            ],
          }),
        ),
    },
    {
      prefilled: pre.docker !== undefined,
      ask: () =>
        answer('docker', () =>
          p.confirm({
            message: 'Docker? (Dockerfiles + docker compose)',
            initialValue: a.docker ?? true,
            ...YES_RECOMMENDED,
          }),
        ),
    },
    {
      prefilled: pre.cicd !== undefined,
      when: () => a.docker === true,
      off: () => {
        a.cicd = false;
      },
      ask: () =>
        answer('cicd', () =>
          p.confirm({
            message: 'CI/CD? (GitHub Actions: checks on PR + VPS deploy pipeline)',
            initialValue: a.cicd ?? true,
            ...YES_RECOMMENDED,
          }),
        ),
    },
    {
      prefilled: pre.agents !== undefined,
      ask: () =>
        answer('agents', () =>
          p.multiselect<AgentId>({
            message: 'Format-on-edit hooks for AI coding agents? (space to toggle)',
            initialValues: a.agents ?? ['claude'],
            required: false,
            options: Object.values(AGENT_HOOKS).map((h) => ({
              value: h.id,
              label: h.id === 'claude' ? `${h.label}${RECOMMENDED}` : h.label,
              hint: h.hint,
            })),
          }),
        ),
    },
    {
      prefilled: pre.skills !== undefined,
      when: () => (a.agents?.length ?? 0) > 0,
      off: () => {
        a.skills = [];
      },
      ask: async () => {
        const stackSkills = plannedSkills({
          stacks: { web: pick(a.web), mobile: pick(a.mobile), api: pick(a.api) },
          skills: ['stack'],
        });
        return answer('skills', () =>
          p.multiselect<SkillPackId>({
            message:
              'Skills for those agents? Best-practice playbooks they load before writing code (space to toggle)',
            initialValues: a.skills ?? ['stack'],
            required: false,
            options: [
              {
                value: 'stack',
                label: `Your frameworks${RECOMMENDED}`,
                hint: `${stackSkills.map((s) => s.name).join(', ')} — official or author-maintained; agents follow each framework's conventions instead of guessing from training data`,
              },
              ...Object.values(EXTRA_SKILL_PACKS).map((pack) => ({
                value: pack.id,
                label: pack.label,
                hint: pack.hint,
              })),
            ],
          }),
        );
      },
    },
    {
      // The summary is a question too: Esc here re-opens the last real one.
      prefilled: false,
      ask: async () => {
        const summary = [
          `web      ${String(a.web)}`,
          `mobile   ${String(a.mobile)}`,
          `api      ${String(a.api)}`,
          `docker   ${a.docker ? 'yes' : 'no'}`,
          `ci/cd    ${a.cicd ? 'yes' : 'no'}`,
          `agents   ${a.agents && a.agents.length > 0 ? a.agents.join(', ') : 'none'}`,
          `skills   ${a.skills && a.skills.length > 0 ? a.skills.join(', ') : 'none'}`,
        ].join('\n');
        p.note(summary, `Creating ./${String(a.dir)}`);
        const proceed = await ask(() => p.confirm({ message: 'Proceed?', initialValue: true }));
        if (proceed === BACK) return BACK;
        if (!proceed) cancelRun();
        return true;
      },
    },
  ];

  // Walk the questions; Esc pops the history and re-asks. Questions a flag answered are
  // never on the history, so stepping back skips them the same way stepping forward does.
  const history: number[] = [];
  let i = 0;
  try {
    while (i < questions.length) {
      const q = questions[i]!;
      if (q.when && !q.when()) {
        q.off?.();
        i++;
        continue;
      }
      if (q.prefilled) {
        i++;
        continue;
      }
      const result = await q.ask();
      if (result === BACK) {
        // Esc on the very first question has nowhere to go: treat it as quitting.
        const prev = history.pop();
        if (prev === undefined) cancelRun();
        i = prev;
        continue;
      }
      history.push(i);
      i++;
    }
  } finally {
    process.stdin.off('keypress', rememberKey);
  }

  return a as InteractiveAnswers;
}
