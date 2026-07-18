import { join } from 'node:path';

import { writeFileLf } from '../fsx';
import { selectedAdapters } from '../stacks/registry';
import { copyTemplate } from '../template';
import type { Step } from './types';

const REQUIRED_SECRETS = ['VPS_SSH_PRIVATE_KEY', 'VPS_HOST', 'VPS_USER', 'VPS_APP_DIR'];

function ciYml(services: string[]): string {
  const setup = [
    '      - uses: actions/checkout@v4',
    '      - uses: oven-sh/setup-bun@v2',
    '        with:',
    '          bun-version: 1.3.x',
    '      - run: bun install --frozen-lockfile',
  ];
  return [
    'name: CI',
    '',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    '',
    'jobs:',
    '  quality:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    ...setup,
    '      - run: bun run lint',
    '      - run: bun run format:check',
    '      - run: bun run typecheck',
    '      - run: bun run knip',
    '',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    ...setup,
    '      - run: bun run build',
    ...(services.length > 0
      ? [
          '',
          '  docker:',
          '    runs-on: ubuntu-latest',
          '    strategy:',
          '      matrix:',
          `        app: [${services.join(', ')}]`,
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - uses: docker/setup-buildx-action@v3',
          '      # Validates every Dockerfile on PR without pushing anything.',
          '      - uses: docker/build-push-action@v6',
          '        with:',
          '          context: .',
          '          file: apps/${{ matrix.app }}/Dockerfile',
          '          push: false',
          '          cache-from: type=gha',
          '          cache-to: type=gha,mode=max',
        ]
      : []),
  ].join('\n');
}

function deployYml(services: string[]): string {
  return [
    'name: Deploy',
    '',
    'on:',
    '  push:',
    '    branches: [main]',
    "    paths: ['apps/**', 'deploy/**', 'compose.yaml', '.github/workflows/deploy.yml']",
    '  workflow_dispatch:',
    '    inputs:',
    '      environment:',
    '        description: Target environment',
    '        type: choice',
    '        options: [staging, production]',
    '        default: staging',
    '',
    'concurrency:',
    "  group: deploy-${{ inputs.environment || 'staging' }}",
    '  cancel-in-progress: false',
    '',
    'permissions:',
    '  contents: read',
    '  packages: write',
    '',
    'jobs:',
    '  build-push:',
    '    runs-on: ubuntu-latest',
    '    strategy:',
    '      matrix:',
    `        app: [${services.join(', ')}]`,
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: docker/setup-buildx-action@v3',
    '      - uses: docker/login-action@v3',
    '        with:',
    '          registry: ghcr.io',
    '          username: ${{ github.actor }}',
    '          password: ${{ secrets.GITHUB_TOKEN }}',
    '      - id: meta',
    '        uses: docker/metadata-action@v5',
    '        with:',
    '          images: ghcr.io/${{ github.repository }}/${{ matrix.app }}',
    '          # A moving tag for compose to reference + an immutable sha tag for rollback.',
    '          tags: |',
    "            type=raw,value=${{ inputs.environment || 'staging' }}",
    '            type=sha',
    '      - uses: docker/build-push-action@v6',
    '        with:',
    '          context: .',
    '          file: apps/${{ matrix.app }}/Dockerfile',
    '          # The VPS is x86 — an ARM-built image fails there with "exec format error".',
    '          platforms: linux/amd64',
    '          push: true',
    '          tags: ${{ steps.meta.outputs.tags }}',
    '          labels: ${{ steps.meta.outputs.labels }}',
    '          cache-from: type=gha',
    '          cache-to: type=gha,mode=max',
    '',
    '  deploy:',
    '    needs: build-push',
    '    runs-on: ubuntu-latest',
    '    # The production environment should have a required reviewer configured on GitHub.',
    "    environment: ${{ inputs.environment || 'staging' }}",
    '    steps:',
    '      - uses: webfactory/ssh-agent@v0.9.0',
    '        with:',
    '          ssh-private-key: ${{ secrets.VPS_SSH_PRIVATE_KEY }}',
    '      - name: Deploy over SSH',
    '        run: |',
    '          ssh -o StrictHostKeyChecking=accept-new -p ${{ secrets.VPS_PORT || 22 }} \\',
    "            ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'DEPLOY'",
    '          set -e',
    '          cd "${{ secrets.VPS_APP_DIR }}"',
    '          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u "${{ github.actor }}" --password-stdin',
    '          docker compose pull',
    '          docker compose up -d --remove-orphans',
    '          # When a database lands: docker compose exec -T api <migrate command>',
    '          docker image prune -f',
    '          DEPLOY',
  ].join('\n');
}

export const cicd: Step = {
  id: 'cicd',
  title: 'Generating CI/CD workflows',
  enabled: (cfg) => cfg.cicd,
  async run(rc, task) {
    const { cfg } = rc;
    const root = cfg.targetDir;
    const dockerized = selectedAdapters(cfg).filter((a) => a.docker);
    const services = dockerized.map((a) => a.dirName);

    task.update('ci.yml + deploy.yml');
    await writeFileLf(join(root, '.github', 'workflows', 'ci.yml'), ciYml(services));
    if (services.length > 0) {
      await writeFileLf(join(root, '.github', 'workflows', 'deploy.yml'), deployYml(services));
    } else {
      rc.report.warn('CI generated; deploy workflow skipped (no containerized apps).');
      rc.cicd = {
        workflows: ['.github/workflows/ci.yml'],
        requiredSecrets: [],
        environments: [],
      };
      return;
    }

    // The VPS-side bundle: image-based compose, nginx configs, env seed, bootstrap doc.
    task.update('deploy/ bundle');
    const lines: string[] = [
      '# Lives on the VPS as docker-compose.yml — CI pulls, never builds.',
      'services:',
    ];
    const api = dockerized.find((a) => a.kind === 'api');
    for (const a of dockerized) {
      const spec = a.docker;
      if (!spec) continue;
      const envVar = `${a.dirName.toUpperCase()}_IMAGE`;
      lines.push(
        `  ${a.dirName}:`,
        `    image: \${${envVar}}`,
        '    ports:',
        // 127.0.0.1 on purpose: Docker's iptables bypass UFW; nginx is the only ingress.
        `      - '127.0.0.1:${String(spec.hostPort)}:${String(spec.containerPort)}'`,
        '    env_file:',
        `      - path: ./env/${a.dirName}.env`,
        '        required: false',
        '    restart: unless-stopped',
        '    logging:',
        '      driver: json-file',
        "      options: { max-size: '10m', max-file: '3' }",
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
    await writeFileLf(join(root, 'deploy', 'docker-compose.vps.yml'), lines.join('\n'));

    await writeFileLf(
      join(root, 'deploy', 'env.example'),
      [
        '# Copy to /srv/<app>/.env on the VPS. Compose substitution vars ONLY — no app secrets.',
        ...dockerized.map(
          (a) => `${a.dirName.toUpperCase()}_IMAGE=ghcr.io/OWNER/REPO/${a.dirName}:staging`,
        ),
      ].join('\n'),
    );

    for (const a of dockerized) {
      await copyTemplate(
        a.kind === 'api' ? 'deploy/nginx-api.conf' : 'deploy/nginx-web.conf',
        join(root, 'deploy', 'nginx', `${a.dirName}.conf`),
      );
    }
    await copyTemplate('deploy/README.md.tpl', join(root, 'deploy', 'README.md'), {
      projectName: cfg.projectName,
    });

    rc.cicd = {
      workflows: ['.github/workflows/ci.yml', '.github/workflows/deploy.yml'],
      requiredSecrets: REQUIRED_SECRETS,
      environments: ['staging', 'production'],
    };
  },
};
