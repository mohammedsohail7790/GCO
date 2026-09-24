# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# NEXT_PUBLIC_* vars are inlined into the client bundle and into any
# statically-prerendered page (canonical/OG tags on /services, /about, etc.)
# at `next build` time - setting them only in the runtime .env that
# docker-compose passes to the `web` service via env_file has NO effect on
# an already-built image. They must be passed as build args instead:
#   docker build --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain \
#                --build-arg NEXT_PUBLIC_REALTIME_URL=wss://your-domain:3001 .
# (docker-compose.yml's `build.args` does this automatically from its own
# .env file.) Left unset, the app still builds and runs correctly against
# the localhost defaults - this only matters once deploying to a real domain.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_REALTIME_URL=${NEXT_PUBLIC_REALTIME_URL}
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/node_modules ./node_modules
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
