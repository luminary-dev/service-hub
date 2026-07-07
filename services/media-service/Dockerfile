# Multi-stage build (#237): a full-toolchain stage compiles the TypeScript, a
# slim runtime stage ships only prod deps + dist and runs as the non-root
# `node` user. Base image pinned by digest for reproducible builds; the
# `# dependabot: <tag>` comment + the tag before the digest let Dependabot's
# docker ecosystem bump both together.
# dependabot: node:22-alpine
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# dependabot: node:22-alpine
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Local-disk fallback storage lives under /app/data (named volumes mount here
# in prod). Create it owned by `node` so the non-root runtime can write, and so
# a fresh named volume inherits that ownership.
RUN mkdir -p /app/data/provider /app/data/review && chown -R node:node /app/data

USER node
EXPOSE 4006
CMD ["npm", "run", "start"]
