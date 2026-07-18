# syntax=docker/dockerfile:1
# Vite SPA: build with bun, serve the static bundle with nginx.

FROM oven/bun:1.3-alpine AS build
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
{{copyPkgJsons}}
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run --filter '{{pkgName}}' build

FROM nginx:1.27-alpine AS run
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
