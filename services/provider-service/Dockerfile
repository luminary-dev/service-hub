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
FROM node:26-alpine@sha256:725aeba2364a9b16beae49e180d83bd597dbd0b15c47f1f28875c290bfd255b9 AS build
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# dependabot: node:22-alpine
FROM node:26-alpine@sha256:725aeba2364a9b16beae49e180d83bd597dbd0b15c47f1f28875c290bfd255b9 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

USER node
EXPOSE 4002
CMD ["npm", "run", "start:migrate"]
