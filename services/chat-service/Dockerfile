# Multi-stage build (#237): a full-toolchain stage compiles the TypeScript, a
# slim runtime stage ships only prod deps + dist and runs as the non-root
# `node` user. Base image pinned by digest for reproducible builds; the
# `# dependabot: <tag>` comment + the tag before the digest let Dependabot's
# docker ecosystem bump both together.
# dependabot: node:24-alpine
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# dependabot: node:24-alpine
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS runtime
# Pull in Alpine security fixes published after the pinned base digest.
RUN apk upgrade --no-cache
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
