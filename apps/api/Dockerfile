# Restaurant OS API - multi-stage build.
#
# Built from the repository root so the shared workspace packages
# (@restaurant-os/types, @restaurant-os/validation) are available.

# ---------------------------------------------------------------- deps
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && apt-get update \
    && apt-get install -y --no-install-recommends openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types/package.json      packages/types/
COPY packages/validation/package.json packages/validation/
COPY packages/config/package.json     packages/config/
COPY apps/api/package.json            apps/api/
COPY apps/web/package.json            apps/web/

RUN pnpm install --frozen-lockfile

# --------------------------------------------------------------- build
FROM deps AS build
WORKDIR /app
COPY packages ./packages
COPY apps/api ./apps/api

# Shared packages ship compiled JS, so build them before the API.
RUN pnpm --filter @restaurant-os/types build \
    && pnpm --filter @restaurant-os/validation build \
    && pnpm --filter @restaurant-os/api exec prisma generate \
    && pnpm --filter @restaurant-os/api build

# Drop dev dependencies from the tree that gets copied into the runtime image.
RUN pnpm --filter @restaurant-os/api --prod deploy /tmp/api-deploy

# ------------------------------------------------------------- runtime
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Tehran

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 1001 restaurant

COPY --from=build /tmp/api-deploy/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma

# Uploads live on a volume; the app must be able to write there.
RUN mkdir -p /app/storage/uploads && chown -R restaurant:restaurant /app

USER restaurant
EXPOSE 4000

# Migrations are applied at start so a fresh volume comes up ready.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
