FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY apps/core/package.json ./apps/core/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace @life-insurance/core --include-workspace-root=false --no-audit --no-fund

FROM dependencies AS migrator
COPY apps/core ./apps/core
WORKDIR /app/apps/core
RUN npm run db:generate
CMD ["node", "scripts/migrate.mjs"]

FROM migrator AS build
RUN npm run build
RUN npm prune --omit=dev --offline --ignore-scripts --workspace @life-insurance/core --include-workspace-root=false --no-audit --no-fund
RUN mkdir -p /app/apps/core/node_modules

FROM base AS seed
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/core/node_modules ./apps/core/node_modules
COPY --from=build --chown=node:node /app/apps/core/dist ./apps/core/dist
COPY --from=build --chown=node:node /app/apps/core/package.json ./apps/core/package.json
USER node
WORKDIR /app/apps/core
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM seed AS runtime
RUN rm -rf /app/apps/core/dist/cli
