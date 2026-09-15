import { describe, expect, test } from 'bun:test';

import type { ProjectConfig } from '../../src/config/schema';
import { buildManifest } from '../../src/manifest';

const cfg: ProjectConfig = {
  projectName: 'demo',
  targetDir: 'C:/x/demo',
  stacks: { web: 'next', mobile: null, api: 'nest' },
  docker: true,
  cicd: false,
  agents: ['claude'],
  git: true,
  install: false,
  output: 'json',
  dryRun: false,
  force: false,
  keepOnError: false,
  verbose: false,
};

describe('buildManifest', () => {
  test('carries the agent-relevant facts', () => {
    const m = buildManifest(
      cfg,
      '0.1.0',
      {
        apps: [],
        scripts: { dev: "bun --filter '*' dev" },
        bunLinker: 'hoisted',
        docker: {
          compose: 'compose.yaml',
          composeDev: 'compose.dev.yaml',
          services: ['web', 'api'],
        },
        cicd: null,
        agentHooks: {
          agents: ['claude'],
          script: 'scripts/agent-format.ts',
          files: ['.claude/settings.json'],
        },
        git: { initialized: true, committed: true },
      },
      true,
    );
    expect(m.ok).toBe(true);
    expect(m.tooling.bunLinker).toBe('hoisted');
    expect(m.docker?.services).toEqual(['web', 'api']);
    expect(m.agentHooks?.files).toEqual(['.claude/settings.json']);
    // install:false ⇒ the manifest must tell the agent to install
    expect(m.nextSteps.some((s) => s.startsWith('bun install'))).toBe(true);
    expect(m.error).toBeUndefined();
  });

  test('failure manifests carry the error block', () => {
    const m = buildManifest(
      cfg,
      '0.1.0',
      {
        apps: [],
        scripts: {},
        bunLinker: 'hoisted',
        docker: null,
        cicd: null,
        agentHooks: null,
        git: { initialized: false, committed: false },
      },
      false,
      { step: 'scaffold-apps', message: 'boom', tail: ['line'] },
    );
    expect(m.ok).toBe(false);
    expect(m.error?.step).toBe('scaffold-apps');
  });
});
