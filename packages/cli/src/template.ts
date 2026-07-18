import { fileURLToPath } from 'node:url';

// Resolves to packages/cli/templates both in dev (src/ sibling) and in the published
// package (dist/ sibling). Never use process.cwd() for template lookup.
export const templatesRoot = fileURLToPath(new URL('../templates', import.meta.url));
