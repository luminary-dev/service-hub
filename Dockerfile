# Next.js web app. /api/* -> gateway proxying happens at request time
# (src/proxy.ts reads GATEWAY_URL from the runtime environment), so no
# build-time GATEWAY_URL is needed and one image can be promoted across
# environments. AUTH_SECRET here is a build-time dummy — the real one comes
# from the runtime environment.
#
# Multi-stage build (#237): a full-toolchain stage runs `next build`, a slim
# runtime stage ships only prod deps + the build output and runs as the
# non-root `node` user with `next start` (Node.js server, supports all
# features incl. the request-time proxy). Base image pinned by digest for
# reproducible builds; the `# dependabot: <tag>` comment + the tag before the
# digest let Dependabot's docker ecosystem bump both together.
# dependabot: node:22-alpine
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN AUTH_SECRET=build-time-dummy npm run build

# dependabot: node:22-alpine
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts

# The .next tree is copied in as root; `next start` writes its runtime cache
# (fetch-cache / prerender cache) under .next/cache, so make it writable by the
# non-root runtime user or Next logs EACCES and can't cache.
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next

USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
