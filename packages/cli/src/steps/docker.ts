import { join } from 'node:path';

import { writeFileLf } from '../fsx';
import { selectedAdapters } from '../stacks/registry';
import { copyTemplate } from '../template';
import type { Step } from './types';

const DOCKERIGNORE = [
  '**/node_modules',
  '**/.git',
  '**/.next',
  '**/.nuxt',
  '**/.output',
  '**/.expo',
  '**/dist',
  '**/coverage',
  '.env',
  '.env.*',
  'deploy/',
];

const LOGGING_BLOCK = [
  '    logging:',
  '      driver: json-file',
  "      options: { max-size: '10m', max-file: '3' }",
];

export const docker: Step = {
  id: 'docker',
  title: 'Generating Docker setup',
  enabled: (cfg) => cfg.docker,
  async run(rc, task) {
    const { cfg } = rc;
    const root = cfg.targetDir;
    const all = selectedAdapters(cfg);
    const dockerized = all.filter((a) => a.docker);
    if (dockerized.length === 0) {
      rc.report.warn('Docker requested, but none of the selected stacks produce a container.');
      return;
    }

    // Every workspace member's package.json must be present in the image for
    // `bun install --frozen-lockfile` — including non-dockerized apps (e.g. Expo).
    const copyPkgJsons = all
      .map((a) => `COPY apps/${a.dirName}/package.json apps/${a.dirName}/`)
      .join('\n');

    task.update('Dockerfiles');
    for (const a of dockerized) {
      const spec = a.docker;
      if (!spec) continue;
      await copyTemplate(`docker/${spec.template}`, join(root, 'apps', a.dirName, 'Dockerfile'), {
        copyPkgJsons,
        pkgName: `@${cfg.projectName}/${a.dirName}`,
        appDir: `apps/${a.dirName}`,
        ...spec.vars,
      });
      if (spec.template === 'vite-nginx.Dockerfile.tpl') {
        await copyTemplate('docker/nginx-spa.conf', join(root, 'apps', a.dirName, 'nginx.conf'));
      }
    }

    task.update('compose.yaml');
    const api = dockerized.find((a) => a.kind === 'api');
    const lines: string[] = ['services:'];
    for (const a of dockerized) {
      const spec = a.docker;
      if (!spec) continue;
      lines.push(
        `  ${a.dirName}:`,
        '    build:',
        '      context: .',
        `      dockerfile: apps/${a.dirName}/Dockerfile`,
        '    ports:',
        `      - '${String(spec.hostPort)}:${String(spec.containerPort)}'`,
        '    env_file:',
        '      - path: ./.env',
        '        required: false',
        '    restart: unless-stopped',
        ...LOGGING_BLOCK,
      );
      if (a.kind === 'api') {
        lines.push(
          '    healthcheck:',
          `      test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:${String(spec.containerPort)}${spec.healthPath}']`,
          '      interval: 30s',
          '      timeout: 3s',
          '      retries: 3',
        );
      }
      if (a.kind === 'web' && api) {
        lines.push('    depends_on:', `      - ${api.dirName}`);
      }
    }
    await writeFileLf(join(root, 'compose.yaml'), lines.join('\n'));
    await writeFileLf(join(root, '.dockerignore'), DOCKERIGNORE.join('\n'));
    await writeFileLf(
      join(root, '.env.example'),
      [
        '# Local runtime configuration for `docker compose up` (copy to .env).',
        '# App-level secrets belong here as well — .env is gitignored.',
        ...(api ? ['# PORT is baked into the images; override app config here instead.'] : []),
      ].join('\n'),
    );

    rc.docker = {
      compose: 'compose.yaml',
      services: dockerized.map((a) => a.dirName),
    };
  },
};
