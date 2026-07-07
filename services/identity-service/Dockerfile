# Multi-stage build (#237): a full-toolchain stage compiles the TypeScript, a
# slim runtime stage ships only prod deps + dist and runs as the non-root
# `node` user. Base image pinned by digest for reproducible builds; the
# `# dependabot: <tag>` comment + the tag before the digest let Dependabot's
# docker ecosystem bump both together.
#
# This is a DB-owning service: the runtime stage keeps the Prisma schema +
# migrations and the `prisma` CLI (a prod dependency) so `start:migrate` can run
# `prisma migrate deploy` before booting. `npm ci --omit=dev`'s postinstall runs
# `prisma generate`, so the client is generated against this stage's node_modules.
# dependabot: node:22-alpine
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# dependabot: node:22-alpine
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

USER node
EXPOSE 4001
CMD ["npm", "run", "start:migrate"]
