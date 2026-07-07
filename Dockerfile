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
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN AUTH_SECRET=build-time-dummy npm run build

# dependabot: node:22-alpine
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts

USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
