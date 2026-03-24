###############################################################################
# VeriRAG Backend — Multi-Stage Dockerfile for Google Cloud Run
###############################################################################

# ── Stage 1: Builder ────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# Build deps only — no apt-get upgrade (non-reproducible; security patches
# come from rebasing on a new python:3.11-slim digest in CI)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

LABEL maintainer="Vaibhav Kumar" \
      org.opencontainers.image.title="VeriRAG Backend" \
      org.opencontainers.image.description="Django MCP Server for Google Cloud Run"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=rag_backend.settings

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

RUN groupadd -r verirag && useradd -r -g verirag -d /app -s /sbin/nologin verirag

WORKDIR /app

# Explicit copies instead of COPY . . — nothing outside this list ships
COPY --chown=verirag:verirag manage.py        ./manage.py
COPY --chown=verirag:verirag mcp_server.py    ./mcp_server.py
COPY --chown=verirag:verirag setup_pgvector.py ./setup_pgvector.py
COPY --chown=verirag:verirag oidc_cred.json   ./oidc_cred.json
COPY --chown=verirag:verirag requirements.txt  ./requirements.txt
COPY --chown=verirag:verirag rag_backend/      ./rag_backend/
COPY --chown=verirag:verirag ai_engine/        ./ai_engine/
COPY --chown=verirag:verirag librarian/        ./librarian/
COPY --chown=verirag:verirag verifier/         ./verifier/

RUN mkdir -p /app/media/pdfs /app/staticfiles \
    && chown -R verirag:verirag /app

USER verirag

# PORT is injected by Cloud Run; default 8000 for local docker-compose
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/api/health/ || exit 1

STOPSIGNAL SIGTERM

CMD ["sh", "-c", "gunicorn rag_backend.wsgi:application \
     --bind 0.0.0.0:${PORT:-8000} \
     --workers 2 \
     --timeout 60 \
     --access-logfile - \
     --error-logfile -"]
