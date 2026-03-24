###############################################################################
# MediRAG Frontend — Multi-Stage Dockerfile
# GCP Track 2: non-root nginx, runtime env injection for both VITE_* vars
###############################################################################

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk update && apk upgrade --no-cache

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# Build with placeholders for both runtime-injected env vars.
# Actual values are injected by docker-entrypoint.sh at container start.
ENV VITE_API_URL=__VITE_API_URL_PLACEHOLDER__
ENV VITE_ADK_URL=__VITE_ADK_URL_PLACEHOLDER__
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginx:stable-alpine AS runtime

RUN apk update && apk upgrade --no-cache

LABEL maintainer="Team96 <team96@medirag.dev>" \
      org.opencontainers.image.title="MediRAG Frontend" \
      org.opencontainers.image.description="React SPA for Cloud-Native RAG"

RUN rm /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

# Real config files — not echoed inline
COPY nginx/medirag.conf        /etc/nginx/conf.d/medirag.conf
COPY docker-entrypoint.sh      /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh \
    && chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid \
    && chown nginx:nginx /docker-entrypoint.sh

USER nginx

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
