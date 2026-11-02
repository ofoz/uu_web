FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

FROM deps AS build
COPY shared shared
COPY backend backend
COPY frontend frontend
RUN npm run build

FROM deps AS prod-deps
RUN npm prune --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY --from=prod-deps /app/node_modules node_modules

COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8787') + '/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/backend
USER node
CMD ["node", "dist/index.js"]
