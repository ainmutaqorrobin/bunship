# syntax=docker/dockerfile:1
# TypeScript API (NestJS / Express / Fastify): build with bun, run compiled JS on node.

FROM oven/bun:1.3-alpine AS build
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
{{copyPkgJsons}}
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run --filter '{{pkgName}}' build

FROM oven/bun:1.3-alpine AS prod-deps
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
{{copyPkgJsons}}
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM node:22-alpine AS run
WORKDIR /repo
ENV NODE_ENV=production PORT=3001
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/{{appDir}}/dist ./{{appDir}}/dist
COPY --from=build /repo/{{appDir}}/package.json ./{{appDir}}/package.json
USER node
WORKDIR /repo/{{appDir}}
EXPOSE 3001
# node --run resolves the app's start script with node_modules/.bin on PATH.
CMD ["node", "--run", "start"]
