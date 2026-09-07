FROM node:22-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=http://api:8004 SHOPPING_STANDALONE=1
WORKDIR /app/examples
COPY examples/package.json examples/package-lock.json ./
COPY examples/web-shared/package.json ./web-shared/package.json
COPY examples/assistant/storefront-web/package.json ./assistant/storefront-web/package.json
RUN npm ci --no-audit --no-fund
COPY examples/web-shared ./web-shared
COPY examples/assistant/storefront-web ./assistant/storefront-web
COPY examples/assistant/data/policies.json ./assistant/data/policies.json
ARG BUILD_NODE_OPTIONS=""
RUN NODE_OPTIONS="$BUILD_NODE_OPTIONS" npm run build --workspace=acme-assistant-web

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3004 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/examples/assistant/storefront-web/.next/standalone ./
COPY --from=build --chown=node:node /app/examples/assistant/storefront-web/.next/static ./assistant/storefront-web/.next/static
COPY --from=build --chown=node:node /app/examples/assistant/storefront-web/public ./assistant/storefront-web/public
USER node
EXPOSE 3004
CMD ["node", "assistant/storefront-web/server.js"]
