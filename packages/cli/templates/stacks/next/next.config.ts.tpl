import path from 'node:path';
import type { NextConfig } from 'next';

const monorepoRoot = path.join(__dirname, '../..');

const nextConfig: NextConfig = {
  // Standalone server output for the Docker image; tracing + Turbopack rooted at the
  // monorepo so workspace dependencies resolve correctly.
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  // Next >=16.3 otherwise upserts its own AGENTS.md/CLAUDE.md into this app the first time
  // `next dev` runs under a coding agent. The root AGENTS.md is the single agent guide for
  // this monorepo and already points at the bundled docs, so keep the tree clean.
  agentRules: false,
};

export default nextConfig;
