# Next.js web app. /api/* -> gateway proxying happens at request time
# (src/proxy.ts reads GATEWAY_URL from the runtime environment), so no
# build-time GATEWAY_URL is needed and one image can be promoted across
# environments. AUTH_SECRET here is a build-time dummy — the real one comes
# from the runtime environment.
#
# Multi-stage build (#237): a full-toolchain stage runs `next build`, a slim
# runtime stage ships Next's standalone output (see `output: "standalone"` in
# next.config.ts) and runs as non-root `node` via `node server.js` — no prod
# node_modules in the final image. Base pinned by digest; the `# dependabot:`
# comment + the tag before the digest let Dependabot bump both together.
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
# Standalone server reads PORT/HOSTNAME from the env; bind all interfaces.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone bundles server.js + traced node_modules; static/ and public/ must
# be copied in alongside for server.js to serve them.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# server.js writes its cache under .next/cache — make it writable by `node`.
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next

USER node
EXPOSE 3000
CMD ["node", "server.js"]
