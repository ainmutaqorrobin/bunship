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

// Build output and dependencies must never be synced from the host into a dev
// container: they are platform-specific and the container builds its own.
const WATCH_IGNORE = [
  'node_modules/',
  'dist/',
  '.next/',
  '.nuxt/',
  '.output/',
  '.expo/',
  'coverage/',
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

    // Dev stack: one image, one service per app, hot reload via `compose watch`.
    task.update('compose.dev.yaml + dev.Dockerfile');
    const devApps = dockerized.filter((a) => a.devPort !== null);
    await copyTemplate('docker/dev.Dockerfile.tpl', join(root, 'dev.Dockerfile'), {
      copyPkgJsons,
    });
    const devLines: string[] = [
      '# Every app at once, with hot reload:',
      '#',
      '#   docker compose -f compose.dev.yaml up --watch',
      '#',
      '# --watch is what makes edits land in the running containers; plain `up` boots the',
      '# same stack but freezes the source at image-build time. There are no bind mounts:',
      '# Windows and macOS hosts do not deliver file events across one, which is where hot',
      '# reload quietly dies. Compose syncs the files in instead.',
      'services:',
    ];
    for (const a of devApps) {
      const spec = a.docker;
      if (!spec || a.devPort === null) continue;
      const port = String(a.devPort);
      const env = { ...(a.kind === 'api' ? { PORT: port } : {}), ...spec.dev?.env };
      devLines.push(
        `  ${a.dirName}:`,
        '    build:',
        '      context: .',
        '      dockerfile: dev.Dockerfile',
        `    working_dir: /repo/apps/${a.dirName}`,
        `    command: ['bun', 'run', 'dev'${(spec.dev?.args ?? []).map((arg) => `, '${arg}'`).join('')}]`,
        '    ports:',
        `      - '${port}:${port}'`,
      );
      if (Object.keys(env).length > 0) {
        devLines.push('    environment:');
        for (const [key, value] of Object.entries(env)) devLines.push(`      ${key}: '${value}'`);
      }
      devLines.push('    env_file:', '      - path: ./.env', '        required: false');
      if (a.kind === 'web' && api) devLines.push('    depends_on:', `      - ${api.dirName}`);
      devLines.push(
        '    develop:',
        '      watch:',
        '        - action: sync',
        `          path: ./apps/${a.dirName}`,
        `          target: /repo/apps/${a.dirName}`,
        '          ignore:',
        ...WATCH_IGNORE.map((p) => `            - ${p}`),
        // A new dependency cannot be synced in — node_modules only exists in the image.
        '        - action: rebuild',
        `          path: ./apps/${a.dirName}/package.json`,
        '        - action: rebuild',
        '          path: ./bun.lock',
      );
    }
    await writeFileLf(join(root, 'compose.dev.yaml'), devLines.join('\n'));

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
      composeDev: 'compose.dev.yaml',
      services: dockerized.map((a) => a.dirName),
    };
  },
};
