###############################################################################
# MediRAG Frontend — Production-Grade Multi-Stage Dockerfile
# GCP Track 2 Best Practices: non-root nginx, minimal image, runtime env injection
###############################################################################

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Security: Upgrade all OS packages to latest patched versions
RUN apk update && apk upgrade --no-cache

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# Build with a known placeholder that we will replace at runtime
ENV VITE_API_URL=__VITE_API_URL_PLACEHOLDER__
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginx:stable-alpine AS runtime

# Security: Upgrade all OS packages to latest patched versions
RUN apk update && apk upgrade --no-cache

LABEL maintainer="Team96 <team96@medirag.dev>" \
      org.opencontainers.image.title="MediRAG Frontend" \
      org.opencontainers.image.description="React SPA for Cloud-Native RAG"

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Add custom nginx config
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root nginx config
RUN echo 'server { \
    listen 8080; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /assets/ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
    gzip on; \
    gzip_types text/css application/javascript application/json image/svg+xml; \
}' > /etc/nginx/conf.d/medirag.conf

# DevOps Magic: Runtime Environment Injection Script
# This fixes the Vite build-time limitation for Cloud Run deployments
RUN echo '#!/bin/sh' > /docker-entrypoint.sh \
    && echo 'if [ -n "$VITE_API_URL" ]; then' >> /docker-entrypoint.sh \
    && echo '  echo "Injecting runtime VITE_API_URL: $VITE_API_URL"' >> /docker-entrypoint.sh \
    && echo '  find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_API_URL_PLACEHOLDER__|$VITE_API_URL|g" {} +;' >> /docker-entrypoint.sh \
    && echo 'fi' >> /docker-entrypoint.sh \
    && echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh \
    && chmod +x /docker-entrypoint.sh

# Run as non-root (Security requirement)
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid \
    && chown nginx:nginx /docker-entrypoint.sh

USER nginx

EXPOSE 8080

# Cloud Run HTTP probes handle health checks; Docker HEALTHCHECK removed.

ENTRYPOINT ["/docker-entrypoint.sh"]
