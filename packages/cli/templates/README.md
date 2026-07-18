# Templates

Static files copied (and `{{var}}`-rendered for `.tpl` files) into generated projects.

| Dir       | Contents                                                                             |
| --------- | ------------------------------------------------------------------------------------ |
| `root/`   | Generated repo root: package.json, oxc/knip configs, husky hooks, .vscode, gitignore |
| `docker/` | Dockerfile templates per runtime model + compose.yaml                                |
| `deploy/` | VPS deploy bundle: compose (image-based), nginx confs, env example, bootstrap README |
| `github/` | GitHub Actions workflow templates (ci.yml, deploy.yml)                               |
| `stacks/` | Internal app templates (express) + per-stack patch files (e.g. next.config.ts)       |

These files are shipped in the npm package (`files: ["dist", "templates"]`) and resolved
relative to the module at runtime — never from `process.cwd()`.
