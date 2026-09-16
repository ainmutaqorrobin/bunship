import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Scripted stand-in for clack: each prompt pops the next answer. 'ESC' first emits the
// keypress readline would emit for the Escape key, then returns clack's cancel symbol —
// exactly the two things the real prompt does in that order.
const CANCEL = Symbol.for('clack:cancel');
let script: unknown[] = [];
let asked: string[] = [];

function pop(opts: { message: string }): unknown {
  asked.push(opts.message);
  const v = script.shift();
  if (v === 'ESC') {
    process.stdin.emit('keypress', '', { name: 'escape' });
    return CANCEL;
  }
  if (v === 'CTRL_C') {
    process.stdin.emit('keypress', '', { name: 'c', ctrl: true });
    return CANCEL;
  }
  return v;
}

mock.module('@clack/prompts', () => ({
  intro: () => {},
  note: () => {},
  cancel: () => {},
  log: { message: () => {} },
  isCancel: (v: unknown) => v === CANCEL,
  text: async (o: { message: string }) => pop(o),
  select: async (o: { message: string }) => pop(o),
  multiselect: async (o: { message: string }) => pop(o),
  confirm: async (o: { message: string }) => pop(o),
}));

const { collectInteractive } = await import('../../src/prompts');

class Exited extends Error {}
const realExit = process.exit;

beforeEach(() => {
  script = [];
  asked = [];
  process.exit = ((code?: number) => {
    throw new Exited(String(code));
  }) as never;
});
afterEach(() => {
  process.exit = realExit;
});

describe('collectInteractive', () => {
  test('happy path asks every question once and returns the answers', async () => {
    script = ['my-app', 'next', 'none', 'nest', true, true, ['claude'], ['stack'], true];
    const a = await collectInteractive({}, 'x');
    expect(a).toEqual({
      dir: 'my-app',
      web: 'next',
      mobile: 'none',
      api: 'nest',
      docker: true,
      cicd: true,
      agents: ['claude'],
      skills: ['stack'],
    });
    expect(asked).toHaveLength(9);
  });

  test('Esc re-asks the previous question and keeps the rest of the flow', async () => {
    // Answer api, press Esc on docker → api again (changed), then continue.
    script = ['my-app', 'next', 'none', 'nest', 'ESC', 'hono', true, false, [], true];
    const a = await collectInteractive({}, 'x');
    expect(a.api).toBe('hono');
    expect(a.docker).toBe(true);
    expect(a.cicd).toBe(false);
    expect(a.skills).toEqual([]);
    expect(asked.filter((m) => m === 'API backend?')).toHaveLength(2);
  });

  test('Esc skips over questions that flags already answered', async () => {
    // web/mobile/api come from flags; Esc on docker must land on the directory question.
    script = ['my-app', 'ESC', 'other-app', true, true, ['claude'], ['stack'], true];
    const a = await collectInteractive({ web: 'next', mobile: 'none', api: 'nest' }, 'x');
    expect(a.dir).toBe('other-app');
    expect(asked.slice(0, 3)).toEqual([
      'Where should the project be created?',
      'Docker? (Dockerfiles + docker compose)',
      'Where should the project be created?',
    ]);
  });

  test('Esc on the summary reopens the last real question', async () => {
    script = ['my-app', 'next', 'none', 'nest', true, true, ['claude'], ['stack'], 'ESC', [], true];
    const a = await collectInteractive({}, 'x');
    expect(a.skills).toEqual([]);
    expect(asked.at(-2)).toStartWith('Skills for those agents?');
  });

  test('conditional questions are skipped and reset when their condition turns off', async () => {
    // cicd answered yes, then Esc twice to docker, flip it to no: cicd must become false
    // and never be asked again; no agents ⇒ skills not asked and empty.
    script = ['my-app', 'next', 'none', 'nest', true, true, 'ESC', 'ESC', false, [], true];
    const a = await collectInteractive({}, 'x');
    expect(a.docker).toBe(false);
    expect(a.cicd).toBe(false);
    expect(a.agents).toEqual([]);
    expect(a.skills).toEqual([]);
    const afterDockerOff = asked.slice(asked.lastIndexOf('Docker? (Dockerfiles + docker compose)'));
    expect(afterDockerOff.some((m) => m.startsWith('CI/CD?'))).toBe(false);
    expect(afterDockerOff.some((m) => m.startsWith('Skills'))).toBe(false);
  });

  test('Ctrl+C still aborts the whole run', async () => {
    script = ['my-app', 'next', 'CTRL_C'];
    await expect(collectInteractive({}, 'x')).rejects.toBeInstanceOf(Exited);
  });

  test('Esc on the first question has nowhere to go and aborts', async () => {
    script = ['ESC'];
    await expect(collectInteractive({}, 'x')).rejects.toBeInstanceOf(Exited);
  });

  test('"No" at the summary aborts', async () => {
    script = ['my-app', 'next', 'none', 'nest', true, true, ['claude'], ['stack'], false];
    await expect(collectInteractive({}, 'x')).rejects.toBeInstanceOf(Exited);
  });
});
