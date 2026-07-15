# Multi-stage build (#237): a full-toolchain stage compiles the TypeScript, a
# slim runtime stage ships only prod deps + dist and runs as the non-root
# `node` user. Base image pinned by digest for reproducible builds; the
# `# dependabot: <tag>` comment + the tag before the digest let Dependabot's
# docker ecosystem bump both together.
# dependabot: node:24-alpine
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# dependabot: node:24-alpine
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS runtime
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
