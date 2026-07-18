# syntax=docker/dockerfile:1
# Next.js standalone build for a Bun monorepo (build with bun, run on node).

FROM oven/bun:1.3-alpine AS build
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
{{copyPkgJsons}}
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run --filter '{{pkgName}}' build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
# next.config.ts sets output:'standalone' + outputFileTracingRoot at the repo root,
# so the standalone bundle mirrors the monorepo layout.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
