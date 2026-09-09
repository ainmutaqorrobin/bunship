# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`create-bunship` — a CLI that scaffolds Bun monorepos by driving each framework's **official
scaffolder** non-interactively (`create-next-app`, `nest new`, `create-vite`, …), then layering a
shared root toolchain on top. The core principle: **this repo does not maintain framework
boilerplate.** App code always comes from upstream, so generated output matches whatever the
framework ships today. Express is the sole exception (`scaffolderPin: null`, an internal template
under `templates/stacks/express`) because there is no official Express scaffolder — resist adding
more.

`packages/cli` is the only package; the root is a private workspace. The repo dogfoods the exact
toolchain it generates (oxlint/oxfmt/knip/husky), so the root `bun run check` and the generated
repo's `bun run check` are the same shape.

## Commands

```sh
bun install
bun run dev -- --help          # run the CLI from source (bun packages/cli/src/index.ts)
bun run check                  # lint + format:check + typecheck + knip — the gate
bun run build                  # tsdown bundle + selftest (writes packages/cli/dist/index.mjs)
bun test                       # unit + e2e
```

`bun test` requires a **prior `bun run build`** — the e2e smoke test spawns `node dist/index.mjs`
to exercise the real npx consumer path, and silently skips (`describe.skipIf`) when `dist` is
missing. A green `bun test` with no build means the e2e never ran.

Single test file / single test:

```sh
bun test packages/cli/test/unit/manifest.test.ts
bun test -t "carries the agent-relevant facts"
```

Generating a scratch repo to inspect output (the fastest real-world check):

```sh
node packages/cli/dist/index.mjs /tmp/demo --web next --api nest --docker --cicd --json
SCAFFOLDER_CANARY=1 node packages/cli/dist/index.mjs /tmp/demo --web next --api nest --json
```

Releases are tag-driven and split in two. `bun run release` (also `release:minor`,
`release:major`, `release:dry`) enforces clean-tree/branch/gate preconditions, then bumps,
commits, tags and pushes — and stops there. Pushing the `v*` tag triggers
`.github/workflows/release.yml`, which re-runs the gate, checks the tag matches
`package.json`, and publishes to npm with `npm publish --provenance`. Auth is npm **trusted
publishing** (OIDC): there is no `NPM_TOKEN` secret, so a publish can only ever come from that
workflow on a `v*` tag. Never bump the version, tag, or publish by hand.

## Architecture

### Pipeline of steps over a shared context

`src/steps/pipeline.ts` runs an ordered `Step[]`:

```
preflight → scaffoldRoot → scaffoldApps → postProcess → tooling → docker → cicd → finalize
```

Each `Step` has `enabled(cfg)` and `run(rc, task)`. They mutate a single `RunContext`
(`src/context.ts`) which accumulates `apps`, `rootScripts`, `bunLinker`, `docker`, `cicd`, `git`.
At the end `buildManifest` turns that context into the JSON manifest. **A step that produces a
user-visible artifact must record it on `rc`**, or it won't reach the manifest.

Order matters in non-obvious ways: `tooling` runs _after_ `postProcess`, so it can read each app's
final `package.json` (that's how knip's `ignoreDependencies` get filtered against real deps).
`finalize` runs `git init` before `bun install` because husky's `prepare` needs `.git` to exist.

### Stack adapters are declarative fragments, not imperative code

`src/stacks/types.ts` defines `StackAdapter`; `registry.ts` maps `StackId → adapter` and returns
them in web → mobile → api order. An adapter contributes:

- `scaffold(ctx)` — run the official scaffolder (or copy an internal template)
- `postProcess(ctx)` — framework-specific fixups, run _after_ step-owned `universalCleanup`
- `scripts` — merged into the app's package.json only if missing
- `tooling` — fragments (`oxlintRules`, `knipWorkspace`, `gitignore`, …) that the `tooling` step
  **aggregates across all selected adapters** into the root configs
- `docker` — `DockerSpec` (template, ports, health path, plus a `dev` fragment saying how that
  framework's dev server binds `0.0.0.0` inside a container)

**The adapter/step boundary is the important invariant: adapters only ever write inside
`ctx.appDir`. Root-level files belong to steps.** Adding a stack should mean adding one adapter
file plus a registry entry — if you find yourself editing a step to special-case a framework, the
fragment contract is probably missing a field. Add the field instead.

### Version pinning and the drift canary

Adapters pin their scaffolder (`scaffolderPin = 'create-next-app@16'`). `resolvePin()` in
`stacks/shared.ts` strips the pin when `SCAFFOLDER_CANARY=1`, which is how the nightly workflow
(`.github/workflows/nightly.yml`) runs the whole matrix against `@latest` to catch upstream drift
before users hit it. **A red canary job is the system working**, not a flake — it means an
upstream scaffolder changed its output and an adapter needs to adapt.

`patchFileOrWarn` deliberately warns instead of throwing when its pattern doesn't match. That
keeps a scaffolder tweak from hard-failing a run, but it also means **a missed patch can silently
produce a broken repo** (a real Nest 12 case: the import patch missed while the registration patch
landed, generating a reference to an unimported name). When adding a patch, prefer a regex that
tolerates plausible upstream variants, and verify the generated repo actually passes its own
`bun run check` — not just that the CLI exited 0.

### Node vs Bun is a real distinction here

The CLI itself runs under Node ≥ 20 (so `npx create-bunship` works), but framework CLIs (`next`,
`nuxt`, `vite`, `nest`) execute under **node via their bin shebang, not under bun** — so the node
on PATH is what actually builds the generated repo. Adapters declare `minNode` floors and
`preflight` fails fast with the version it found. Floors are plain minimums rather than upstream
semver ranges on purpose: this package ships **zero runtime dependencies** (tsdown bundles
everything via `deps.alwaysBundle`), so there's no semver library to lean on.

### Output contract

`Reporter` has two implementations (`reporter/clack.ts` pretty, `reporter/json.ts` agent mode).
In `--json` mode **`outro` is the only thing ever written to stdout** — exactly one JSON manifest;
every progress message goes to stderr. Exit codes are part of the API: `0` ok, `1` pipeline
failure (`ScaffoldError`), `2` usage error (`UsageError`). Failure still emits a full manifest,
with an `error` block naming the step. Don't add `console.log` to the pipeline.

### Templates

`src/template.ts` resolves `templatesRoot` relative to `import.meta.url` so it works from both
`src/` and the published `dist/` — **never use `process.cwd()` for template lookup**. Files ending
`.tpl` get `{{var}}` substitution and lose the suffix on copy.

## Conventions

- **Write files with `writeFileLf`/`writeJson` from `fsx.ts`**, never raw `fs.writeFile`. Generated
  repos are LF-only with a trailing newline and no BOM (they also get `.gitattributes` with
  `* text=auto eol=lf`), which is what keeps `oxfmt --check` green on Windows.
- **Windows is a first-class target**, not an afterthought — CI builds and tests on
  `windows-latest`. `exec.ts` hunts for a real `bun.exe` because `spawn(shell:false)` can't run
  `.cmd` shims. Scaffolders misbehave differently there (create-vite mangles absolute paths, so it
  gets a relative dir plus `cwd`); those workarounds are load-bearing and commented as such.
- `oxfmt` is **exact-pinned** (not `^`) in both this repo and `versions.ts` for generated repos:
  it's beta, and formatting churn between versions would break `format:check` on untouched repos.
  Bump with `bun update oxfmt && bun run format`.
- Generated-repo dependency versions live in `src/versions.ts`, not scattered across steps.
- The product name lives only in `src/branding.ts`.
- Comments in this codebase explain _why_ — upstream bug numbers, platform quirks, ordering
  constraints. Match that when touching adapter/step code; a comment that restates the code is
  noise, one that records why an upstream forced your hand is the point.

## Other agent configs

There's an OpenAI Codex config at `~/.codex/config.toml`. If you want its user-level items
(MCP servers, slash commands, subagents, skills, instructions) available in Claude Code, reply
`/import` to scan and list what's importable, then `/import --yes=<digest>` (the scan output names
the digest) to apply. If `/import` isn't available on this surface, run `claude import` from a
terminal instead.
