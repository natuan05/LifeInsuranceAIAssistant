FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/core/package.json ./apps/core/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace @life-insurance/web --include-workspace-root=false --no-audit --no-fund

FROM dependencies AS build
COPY apps/web ./apps/web
WORKDIR /app/apps/web
ARG NEXT_PUBLIC_CORE_API_URL=/api/v1
ARG NEXT_PUBLIC_DATABASE_UI_URL=http://127.0.0.1:5050
ENV NEXT_PUBLIC_CORE_API_URL=$NEXT_PUBLIC_CORE_API_URL
ENV NEXT_PUBLIC_DATABASE_UI_URL=$NEXT_PUBLIC_DATABASE_UI_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p public && npm run build

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
