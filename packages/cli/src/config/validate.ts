import { UsageError } from '../errors';
import { PROJECT_NAME_RE, type ProjectConfig } from './schema';

export function validateConfig(cfg: ProjectConfig): void {
  if (!PROJECT_NAME_RE.test(cfg.projectName)) {
    throw new UsageError(
      `Invalid project name "${cfg.projectName}". Use lowercase kebab-case: letters, digits and dashes, starting with a letter (e.g. "my-startup").`,
    );
  }
  if (cfg.projectName.length > 100) {
    throw new UsageError('Project name is too long (max 100 characters).');
  }
  const { web, mobile, api } = cfg.stacks;
  if (!web && !mobile && !api) {
    throw new UsageError('Nothing to scaffold: select at least one of --web, --mobile or --api.');
  }
  if (cfg.cicd && !cfg.docker) {
    throw new UsageError('--cicd requires Docker; drop --no-docker or drop --cicd.');
  }
}
