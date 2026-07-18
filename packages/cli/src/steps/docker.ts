import type { Step } from './types';

export const docker: Step = {
  id: 'docker',
  title: 'Generating Docker setup',
  enabled: (cfg) => cfg.docker,
  async run(rc) {
    // Real Dockerfile/compose templates land in M5.
    rc.report.warn('Docker generation is not implemented yet (M5) — skipped.');
    await Promise.resolve();
  },
};
