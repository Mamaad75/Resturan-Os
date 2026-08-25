# Restaurant OS web - multi-stage build using Next.js standalone output.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types/package.json      packages/types/
COPY packages/validation/package.json packages/validation/
COPY packages/config/package.json     packages/config/
COPY apps/api/package.json            apps/api/
COPY apps/web/package.json            apps/web/

RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app

# NEXT_PUBLIC_* values are inlined at build time, so they must be present here
# rather than only at runtime.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ARG NEXT_PUBLIC_WS_URL=http://localhost:4000
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1

COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm --filter @restaurant-os/types build \
    && pnpm --filter @restaurant-os/validation build \
    && pnpm --filter @restaurant-os/web build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Tehran NEXT_TELEMETRY_DISABLED=1

RUN useradd --system --create-home --uid 1001 nextjs

# The standalone bundle carries only the modules the server actually needs.
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
