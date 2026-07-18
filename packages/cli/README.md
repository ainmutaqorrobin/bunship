# create-scaffolder

> Working name — the final package name is decided before the first publish.

Scaffold a production-ready **Bun monorepo** in one command. Instead of maintaining its own
boilerplate, this CLI orchestrates each framework's **official scaffolder**
(`create-next-app`, `nest new`, `create-vite`, `create-nuxt`, `create-expo-app`,
`create-hono`, `fastify generate`) and then wires a single coherent toolchain on top.

```sh
bun create scaffolder my-startup            # interactive
# or, fully non-interactive (AI-agent mode):
bunx create-scaffolder my-startup --web next --api nest --docker --cicd --json
```

## What you get

```
my-startup/
├── apps/web        Next.js | React+Vite | Nuxt        (pick one, optional)
├── apps/mobile     Expo                               (optional)
├── apps/api        NestJS | Express | Hono | Fastify  (pick one, optional)
├── compose.yaml + per-app Dockerfile                  (--docker)
├── deploy/         VPS bundle: image-based compose, nginx, bootstrap guide
├── .github/        ci.yml + deploy.yml (GHCR → SSH → compose pull/up)
└── root toolchain  bun workspaces · oxlint · oxfmt · knip · husky + lint-staged
```

Every generated repo passes `bun run check` (lint + format + typecheck + knip) and
`bun run build` out of the box — that is enforced by this project's nightly CI matrix.

## Flags

| Flag                                                                  | Meaning                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `--web <next\|react-vite\|nuxt\|none>`                                | Web frontend                                                |
| `--mobile <expo\|none>`                                               | Mobile app                                                  |
| `--api <nest\|express\|hono\|fastify\|none>`                          | API backend                                                 |
| `--docker` / `--no-docker`                                            | Dockerfiles + compose.yaml                                  |
| `--cicd` / `--no-cicd`                                                | GitHub Actions CI + VPS deploy pipeline (implies docker)    |
| `--json`                                                              | Agent mode: no prompts, stdout is exactly one JSON manifest |
| `-y, --yes`                                                           | Defaults: next + nest + docker + cicd                       |
| `--dry-run`                                                           | Print the manifest without writing anything                 |
| `--no-git`, `--no-install`, `--force`, `--verbose`, `--keep-on-error` | What they say                                               |

## Agent mode

`--json` makes the CLI a good citizen for AI coding agents: all progress goes to stderr,
stdout carries a single JSON manifest (apps, ports, scripts, required deploy secrets, next
steps), exit codes are meaningful (0 ok / 1 pipeline / 2 usage), and the generated repo
contains an `AGENTS.md` so agents don't re-derive conventions. Boilerplate comes from
official scaffolders, not from model output — that's the whole point.

Requires **Bun ≥ 1.3** on PATH (plus git, unless `--no-git`). The CLI itself runs under
Node ≥ 20 (npx-compatible).
