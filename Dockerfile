# Next.js web app. Rewrites (/api/* -> gateway) are baked into the build, so
# GATEWAY_URL must be provided at build time (compose passes the in-network
# address). AUTH_SECRET here is a build-time dummy — the real one comes from
# the runtime environment.
FROM node:22-alpine
WORKDIR /app

ARG GATEWAY_URL=http://api-gateway:4000

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV GATEWAY_URL=$GATEWAY_URL
RUN AUTH_SECRET=build-time-dummy npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
