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
ENV OTEL_SERVICE_NAME=chat-service

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

USER node
EXPOSE 4007
CMD ["npm", "run", "start"]
