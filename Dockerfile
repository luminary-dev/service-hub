# Next.js web app. /api/* -> gateway proxying happens at request time
# (src/proxy.ts reads GATEWAY_URL from the runtime environment), so no
# build-time GATEWAY_URL is needed and one image can be promoted across
# environments. AUTH_SECRET here is a build-time dummy — the real one comes
# from the runtime environment.
#
# Multi-stage build (#237): a full-toolchain stage runs `next build`, a slim
# runtime stage ships Next's STANDALONE output — a self-contained server whose
# node_modules are traced down to only what the routes use (see
# `output: "standalone"` in next.config.ts), so no `npm ci` and no full prod
# node_modules in the final image. Runs as the non-root `node` user via
# `node server.js` (the standalone server; supports the request-time proxy and
# all Node features). Base image pinned by digest for reproducible builds; the
# `# dependabot: <tag>` comment + the tag before the digest let Dependabot's
# docker ecosystem bump both together.
# dependabot: node:22-alpine
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .
RUN AUTH_SECRET=build-time-dummy npm run build

# dependabot: node:22-alpine
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Standalone server reads PORT/HOSTNAME from the env; bind all interfaces so the
# container is reachable, on the same port `next start` used.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The standalone bundle carries its own traced node_modules + server.js. Static
# assets and public/ are NOT included by the standalone server automatically —
# copy them into the places server.js serves them from.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# server.js writes its runtime cache (fetch-cache / prerender cache) under
# .next/cache, so make it writable by the non-root runtime user or Next logs
# EACCES and can't cache.
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next

USER node
EXPOSE 3000
CMD ["node", "server.js"]
