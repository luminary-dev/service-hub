# Multi-stage build (#237): a full-toolchain stage compiles the TypeScript, a
# slim runtime stage ships only prod deps + dist and runs as the non-root
# `node` user. Base image pinned by digest for reproducible builds; the
# `# dependabot: <tag>` comment + the tag before the digest let Dependabot's
# docker ecosystem bump both together.
# dependabot: node:24-alpine
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# dependabot: node:24-alpine
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Distributed tracing (#668): OTel resource service.name for this service.
# Harmless when tracing is off — src/tracing.js only reads it once the SDK
# starts, which requires OTEL_EXPORTER_OTLP_ENDPOINT (unset in dev/CI). Baked
# into the image so the canonical src/tracing.ts stays byte-identical.
ENV OTEL_SERVICE_NAME=media-service

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# sharp (#351): npm can silently drop a platform-specific *optional* dependency
# on a transient fetch error, which intermittently left the prebuilt libvips
# binary out of the image and crashed the service at boot with ERR_DLOPEN_FAILED.
# Reinstall sharp's prebuilt binary as REQUIRED packages (build fails loudly
# instead of shipping a broken image), then prove the native module loads.
COPY scripts/install-sharp-binary.cjs ./scripts/
RUN node scripts/install-sharp-binary.cjs \
 && node -e "require('sharp')"
COPY --from=build /app/dist ./dist

# Local-disk fallback storage lives under /app/data (named volumes mount here
# in prod). Create it owned by `node` so the non-root runtime can write, and so
# a fresh named volume inherits that ownership.
RUN mkdir -p /app/data/provider /app/data/review && chown -R node:node /app/data

USER node
EXPOSE 4006
CMD ["npm", "run", "start"]
