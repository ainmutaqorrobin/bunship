# syntax=docker/dockerfile:1
# One dev image for the whole workspace: every service in compose.dev.yaml runs this
# image and just points at a different app's `dev` script.
#
# Source is NOT bind-mounted. `docker compose up --watch` copies changed files into
# the container instead, so each framework's file watcher sees ordinary local writes
# — bind mounts do not deliver inotify events from Windows or macOS hosts, which is
# exactly where hot reload silently stops working.

FROM oven/bun:1.3-alpine
# Framework CLIs (next, nuxt, vite, nest) are node-shebang bins and the bun image
# ships no node.
RUN apk add --no-cache nodejs

WORKDIR /repo

# Dependency layer first: it only reinstalls when a manifest or the lockfile changes.
COPY package.json bun.lock bunfig.toml ./
{{copyPkgJsons}}
# --ignore-scripts keeps husky's `prepare` from failing on the .git-less build context.
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
