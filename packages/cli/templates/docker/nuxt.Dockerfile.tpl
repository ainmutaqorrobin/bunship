# syntax=docker/dockerfile:1
# Nuxt: build with bun; Nitro's .output is fully self-contained (no node_modules needed).

FROM oven/bun:1.3-alpine AS build
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
{{copyPkgJsons}}
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run --filter '{{pkgName}}' build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 NITRO_HOST=0.0.0.0
COPY --from=build /repo/apps/web/.output ./
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
