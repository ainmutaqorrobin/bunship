# syntax=docker/dockerfile:1
# Bun-native API (Hono): bun runs the TypeScript source directly.

FROM oven/bun:1.3-alpine AS prod-deps
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
{{copyPkgJsons}}
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.3-alpine AS run
WORKDIR /repo
ENV NODE_ENV=production PORT=3001
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY {{appDir}} ./{{appDir}}
COPY package.json ./
USER bun
WORKDIR /repo/{{appDir}}
EXPOSE 3001
CMD ["bun", "src/index.ts"]
