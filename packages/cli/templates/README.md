# Templates

Static files copied (and `{{var}}`-rendered for `.tpl` files) into generated projects.
Root-level configs (package.json, oxc/knip configs, hooks, READMEs) are generated
programmatically by the tooling step — only genuinely static content lives here.

| Dir       | Contents                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `docker/` | Dockerfile per runtime model (next standalone, node-api, bun-api, nuxt, vite+nginx) + SPA nginx conf |
| `deploy/` | VPS bundle sources: nginx reverse-proxy configs, bootstrap README                                    |
| `stacks/` | Internal app templates (express) + per-stack patch files (next.config.ts, hono entry)                |

These files ship in the npm package (`files: ["dist", "templates"]`) and are resolved
relative to the module at runtime — never from `process.cwd()`.
