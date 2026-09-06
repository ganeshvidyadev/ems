# syntax=docker/dockerfile:1.7
#
# Multi-stage build for @ems/api, built from the monorepo root
# (`docker build -f apps/api/Dockerfile .`). One image serves both roles —
# `EMS_ROLE=api` runs `dist/main.js`, `EMS_ROLE=worker` runs `dist/worker.js`
# (see `queues/processors/*` — every processor gates on `EMS_ROLE==='worker'`)
# — so the API Deployment and the worker Deployment in `infra/k8s` are the
# same image with a different `command` and `env`, never two images to keep
# in sync.
#
# `turbo prune` (not a plain `pnpm install` at the repo root) is what keeps
# the build context to only what @ems/api actually depends on — pruning is
# what a Turborepo monorepo needs to avoid dragging apps/console's and
# apps/storefront's entire dependency trees into an API image that never
# imports them.

FROM node:20-alpine AS base
RUN corepack enable

# ---------------------------------------------------------------------------
# 1. Prune the workspace down to @ems/api's own closure.
# ---------------------------------------------------------------------------
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@2.3.3
COPY . .
RUN turbo prune @ems/api --docker

# ---------------------------------------------------------------------------
# 2. Install pruned deps, then build.
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Installed from the lockfile-only skeleton first, so this layer only
# invalidates when a dependency actually changes, not on every source edit.
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@ems/api...

# Drop devDependencies before the runtime stage copies node_modules —
# `--prod` re-resolves against the same frozen lockfile, so this cannot drift
# from what was actually built against.
RUN pnpm install --frozen-lockfile --prod

# ---------------------------------------------------------------------------
# 3. Runtime — slim, non-root.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init \
  && addgroup -g 1001 -S nodejs \
  && adduser -u 1001 -S ems -G nodejs

WORKDIR /app
ENV NODE_ENV=production
ENV EMS_ROLE=api

COPY --from=builder --chown=ems:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=ems:nodejs /app/apps/api/scripts ./apps/api/scripts
COPY --from=builder --chown=ems:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=ems:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=ems:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=ems:nodejs /app/packages ./packages

USER ems
WORKDIR /app/apps/api
EXPOSE 4000

# `/health/live`, not `/api/v1/health/live` — `main.ts`'s `setGlobalPrefix`
# call explicitly excludes health routes from the API prefix.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# `dumb-init` reaps zombie processes and forwards SIGTERM properly — plain
# `node dist/main.js` as PID 1 would otherwise ignore SIGTERM, forcing
# Kubernetes to wait out the full terminationGracePeriod on every rollout.
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "node dist/$( [ \"$EMS_ROLE\" = \"worker\" ] && echo worker || echo main ).js"]
