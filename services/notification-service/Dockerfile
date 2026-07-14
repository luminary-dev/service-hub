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
# dependabot: node:24-alpine
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# dependabot: node:24-alpine
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force && rm -rf /root/.cache/prisma
COPY --from=build /app/dist ./dist

USER node
EXPOSE 4005
CMD ["npm", "run", "start:migrate"]
