# One image for every role: setup (migrations and seed), api, worker and web.
# Build arg INDUSTRY_PACK picks the industry pack (a directory of industry-packs/, default manufacturing);
# the image holds that one only, in industry/.
# Build arg NPM_REGISTRY switches the npm registry (e.g. https://registry.npmmirror.com in mainland China).
FROM node:24-trixie-slim AS base
WORKDIR /app
# pg_dump for the optional database backups (Debian's client matches the PostgreSQL 17 server in compose).
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM base AS build
ARG NPM_REGISTRY=
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/backend/package.json packages/backend/
COPY packages/contracts/package.json packages/contracts/
COPY industry/package.json industry/
RUN npm ci --no-audit --no-fund ${NPM_REGISTRY:+--registry=$NPM_REGISTRY}
COPY . .
# Before the web build, which bundles the pack's pages and nameplates.
ARG INDUSTRY_PACK=manufacturing
RUN node scripts/select-industry.ts "$INDUSTRY_PACK" && rm -rf industry-packs
RUN npm run build -w @aihot/web && npm prune --omit=dev --no-audit --no-fund

FROM base
ARG INDUSTRY_PACK=manufacturing
# The pack this image holds (industry-packs/ is gone, so the scripts read the name from here).
ENV NODE_ENV=production INDUSTRY_PACK=$INDUSTRY_PACK
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.ts"]
