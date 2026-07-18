# bunship

A CLI that scaffolds production-ready **Bun monorepos** by orchestrating each framework's
**official scaffolder** (`create-next-app`, `nest new`, `create-vite`, `create-hono`, …)
non-interactively, then layering an opinionated root toolchain on top:

- **Bun** — package manager + workspaces (`bun --filter '*' dev`)
- **oxc** — `oxlint` (linting) + `oxfmt` (formatting)
- **knip** — unused files, exports, and dependencies
- **husky + lint-staged** — pre-commit format/lint, pre-push full check
- optional **Docker + GitHub Actions CI/CD** — VPS deploy (image → registry → SSH → compose → Nginx/TLS)

Because apps come from official scaffolders, generated code always matches upstream — and AI
coding agents can bootstrap projects without burning tokens on boilerplate (`--json` agent mode).

Scaffold it, ship it: `bun create bunship`, then push.

## Repo layout

| Path           | What                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `packages/cli` | The published `create-bunship` package (CLI, stack adapters, pipeline, templates) |

This repo dogfoods the exact root toolchain the CLI generates. The product name lives in
one place: `packages/cli/src/branding.ts`.

## Development

```sh
bun install
bun run dev -- --help        # run the CLI from source
bun run check                # lint + format:check + typecheck + knip
bun run build                # bundle with tsdown + selftest
bun test                     # unit tests + smoke e2e (needs a prior build)
```
