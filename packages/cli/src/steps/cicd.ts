import type { Step } from './types';

export const cicd: Step = {
  id: 'cicd',
  title: 'Generating CI/CD workflows',
  enabled: (cfg) => cfg.cicd,
  async run(rc) {
    // ci.yml + deploy.yml (deploy-vps pattern) land in M5.
    rc.report.warn('CI/CD generation is not implemented yet (M5) — skipped.');
    await Promise.resolve();
  },
};
