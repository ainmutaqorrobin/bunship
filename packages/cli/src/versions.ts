// Devtool versions written into generated repos.
// oxfmt is EXACT-pinned: it is beta, and formatting churn between versions would
// break `format:check` on untouched repos. Bump = `bun update oxfmt && bun run format`.
export const GENERATED_DEV_DEPS: Record<string, string> = {
  knip: '^6.27.0',
  oxfmt: '0.59.0',
  oxlint: '^1.74.0',
  typescript: '^5.9.0',
};

export const GENERATED_GIT_DEV_DEPS: Record<string, string> = {
  husky: '^9.1.7',
  'lint-staged': '^17.0.0',
};

// Bun 1.4 is a full Rust rewrite currently in canary — pin generated repos out of it.
export const BUN_ENGINES = '>=1.3.0 <1.4.0';
