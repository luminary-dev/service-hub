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
# dependabot: node:24-alpine
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .
RUN AUTH_SECRET=build-time-dummy npm run build

# dependabot: node:24-alpine
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime
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
