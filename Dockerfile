FROM node:22-alpine AS build

ARG NPM_REGISTRY=https://registry.npmjs.org

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --registry="${NPM_REGISTRY}"

COPY . .
RUN npm run build \
    && npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server

USER node

EXPOSE 3001
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "dist-server/server/index.js"]
