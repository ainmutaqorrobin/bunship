# bunship

A CLI that scaffolds production-ready **Bun monorepos** by orchestrating each framework's
**official scaffolder** non-interactively, then layering an opinionated root toolchain on
top:

- **Bun** — package manager + workspaces (`bun --filter '*' dev`)
- **oxc** — `oxlint` (linting) + `oxfmt` (formatting)
- **knip** — unused files, exports, and dependencies
- **husky + lint-staged** — pre-commit format/lint, pre-push full check
- optional **Docker** — prod-parity `compose.yaml` plus a hot-reload dev stack (`bun run docker:dev`)
- optional **GitHub Actions CI/CD** — VPS deploy (image → registry → SSH → compose → Nginx/TLS)
- optional **AI-agent hooks** — every file Claude Code / Cursor / Copilot / Codex / Gemini / Windsurf edits is oxlint-fixed + oxfmt'd on the spot
- optional **agent skills** — official/author-maintained `SKILL.md` playbooks for each selected framework (Vercel, Expo, Hono, Fastify, …) installed where those agents read them, wired into `AGENTS.md`

Because apps come from official scaffolders, generated code always matches upstream — and AI
coding agents can bootstrap projects without burning tokens on boilerplate (`--json` agent mode).

Scaffold it, ship it: `bun create bunship`, then push.

## Supported frameworks

| Slot   | Options                           | Scaffolded with                                                        |
| ------ | --------------------------------- | ---------------------------------------------------------------------- |
| Web    | Next.js · React + Vite · Nuxt     | `create-next-app` · `create-vite` · `create-nuxt`                      |
| Mobile | Expo                              | `create-expo-app`                                                      |
| API    | NestJS · Express · Hono · Fastify | `nest new` · built-in TS template · `create-hono` · `fastify generate` |

Every slot is optional. Each app is patched into the workspace (package name, ports,
`/health` endpoint on APIs) and normalized with oxfmt, so `bun run check` and
`bun run build` pass from the first commit.

## What a run produces

```
my-startup/
├── apps/{web,mobile,api}    official scaffolder output, workspace-wired
├── package.json             bun workspaces · dev / dev:<app> / build / check scripts
├── .oxlintrc.json · .oxfmtrc.json · knip.json
├── .husky/ · .vscode/ · AGENTS.md · CLAUDE.md · .env.example
├── scripts/agent-format.ts + .claude/settings.json …  (--agents)
├── .agents/skills/ · .claude/skills/ · skills-lock.json  (--skills)
├── compose.yaml · compose.dev.yaml · Dockerfiles      (--docker)
├── .github/workflows/{ci,deploy}.yml                  (--cicd)
└── deploy/                  VPS bundle: compose, nginx + TLS, bootstrap guide
```

Finishes with `git init` → `bun install` → oxfmt pass → first commit. Full flag reference
and details: [packages/cli/README.md](packages/cli/README.md).

With `--docker` you get two stacks: `bun run docker:prod` (the images CI deploys) and
`bun run docker:dev` — every app's dev server in a container, hot reload via Compose
Watch rather than bind mounts, so edits land on Windows and macOS hosts too.

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
