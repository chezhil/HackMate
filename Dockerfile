# HackMate: one Node server with its SQLite data on a mounted volume at /app/data.
# Node 24 has node:sqlite built in.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
 # The build traces the data folder into the standalone output; the real one is the mounted volume.
 && rm -rf .next/standalone/data

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    HACKMATE_REQUIRE_LOGIN=1
# The standalone server, plus the static files it doesn't copy itself.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Mount the volume here; the database, per-account files and uploads all live in it.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
