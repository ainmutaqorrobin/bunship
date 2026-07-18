import * as p from '@clack/prompts';

import type { ApiStack, MobileStack, WebStack } from './config/schema';

// Some bundlers have dropped clack's `isCancel` runtime export (bombshell-dev/clack#470).
// This module owns all cancel handling; `--selftest` verifies the bundle at build time.
export const clackIsCancelIsReal = typeof p.isCancel === 'function';

const CLACK_CANCEL = Symbol.for('clack:cancel');

export function isCancelSafe(value: unknown): value is symbol {
  return clackIsCancelIsReal ? p.isCancel(value) : value === CLACK_CANCEL;
}

function guard<T>(value: T | symbol): T {
  if (isCancelSafe(value)) {
    p.cancel('Cancelled — nothing was written.');
    process.exit(0);
  }
  return value as T;
}

export interface InteractivePre {
  dirArg?: string;
  web?: WebStack | 'none';
  mobile?: MobileStack | 'none';
  api?: ApiStack | 'none';
  docker?: boolean;
  cicd?: boolean;
}

export interface InteractiveAnswers {
  dir: string;
  web: WebStack | 'none';
  mobile: MobileStack | 'none';
  api: ApiStack | 'none';
  docker: boolean;
  cicd: boolean;
}

/** Ask only for what the CLI flags did not already provide. */
export async function collectInteractive(
  pre: InteractivePre,
  intro: string,
): Promise<InteractiveAnswers> {
  p.intro(intro);

  const dir =
    pre.dirArg ??
    guard(
      await p.text({
        message: 'Where should the project be created?',
        placeholder: 'my-startup',
        validate: (v) => (!v || v.trim() === '' ? 'A directory name is required.' : undefined),
      }),
    );

  const web =
    pre.web ??
    guard(
      await p.select<WebStack | 'none'>({
        message: 'Web frontend?',
        initialValue: 'next',
        options: [
          { value: 'next', label: 'Next.js', hint: 'React, SSR, App Router' },
          { value: 'react-vite', label: 'React + Vite', hint: 'SPA' },
          { value: 'nuxt', label: 'Nuxt', hint: 'Vue, SSR' },
          { value: 'none', label: 'None' },
        ],
      }),
    );

  const mobile =
    pre.mobile ??
    guard(
      await p.select<MobileStack | 'none'>({
        message: 'Mobile app?',
        initialValue: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'expo', label: 'Expo', hint: 'React Native + expo-router' },
        ],
      }),
    );

  const api =
    pre.api ??
    guard(
      await p.select<ApiStack | 'none'>({
        message: 'API backend?',
        initialValue: 'nest',
        options: [
          { value: 'nest', label: 'NestJS', hint: 'structured, batteries included' },
          { value: 'hono', label: 'Hono', hint: 'ultralight, Bun-native' },
          { value: 'express', label: 'Express', hint: 'the classic' },
          { value: 'fastify', label: 'Fastify', hint: 'fast, schema-driven' },
          { value: 'none', label: 'None' },
        ],
      }),
    );

  const docker =
    pre.docker ??
    guard(
      await p.confirm({
        message: 'Docker? (Dockerfiles + docker compose)',
        initialValue: true,
      }),
    );

  const cicd = docker
    ? (pre.cicd ??
      guard(
        await p.confirm({
          message: 'CI/CD? (GitHub Actions: checks on PR + VPS deploy pipeline)',
          initialValue: true,
        }),
      ))
    : false;

  const summary = [
    `web      ${web}`,
    `mobile   ${mobile}`,
    `api      ${api}`,
    `docker   ${docker ? 'yes' : 'no'}`,
    `ci/cd    ${cicd ? 'yes' : 'no'}`,
  ].join('\n');
  p.note(summary, `Creating ./${dir}`);

  const proceed = guard(await p.confirm({ message: 'Proceed?', initialValue: true }));
  if (!proceed) {
    p.cancel('Cancelled — nothing was written.');
    process.exit(0);
  }

  return { dir, web, mobile, api, docker, cicd };
}
