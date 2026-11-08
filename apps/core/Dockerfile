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

FROM migrator AS test
COPY data/synthetic/manulife-demo-v1/policies.json data/synthetic/manulife-demo-v1/manifest.json /app/data/synthetic/manulife-demo-v1/
COPY data/public/manifest-manulife-text.json /app/data/public/manifest-manulife-text.json
COPY data/public/manulife/text/ /app/data/public/manulife/text/
RUN npm run build
COPY apps/web/public/fonts/lexend-400.ttf apps/web/public/fonts/lexend-700.ttf /app/apps/core/dist/cli/assets/
CMD ["node", "--test", "test/conversation-permissions.test.cjs"]

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
COPY --chown=node:node apps/web/public/fonts/lexend-400.ttf apps/web/public/fonts/lexend-700.ttf apps/web/public/fonts/OFL-Lexend.txt ./apps/core/dist/cli/assets/
COPY --chown=node:node data/synthetic/manulife-demo-v1/policies.json data/synthetic/manulife-demo-v1/manifest.json ./data/synthetic/manulife-demo-v1/
COPY --chown=node:node data/public/manifest-manulife-text.json ./data/public/manifest-manulife-text.json
COPY --chown=node:node data/public/manulife/text/ ./data/public/manulife/text/
USER node
WORKDIR /app/apps/core
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM seed AS runtime
USER root
RUN rm -rf /app/apps/core/dist/cli /app/data
USER node
