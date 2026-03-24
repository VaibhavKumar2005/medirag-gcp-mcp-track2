###############################################################################
# VeriRAG Backend — Optimized Multi-Stage Dockerfile for Google Cloud Run
###############################################################################

# ── Stage 1: Builder ────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# Install build dependencies for PostgreSQL (psycopg2)
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
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

# Install runtime dependencies
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Security: Run as non-root user
RUN groupadd -r verirag && useradd -r -g verirag -d /app -s /sbin/nologin verirag

WORKDIR /app
COPY --chown=verirag:verirag . .

# Create required directories for local assets
RUN mkdir -p /app/media/pdfs /app/staticfiles \
    && chown -R verirag:verirag /app

USER verirag
EXPOSE 8000

# Cloud Run Health Check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

STOPSIGNAL SIGTERM

# Gunicorn optimized for Cloud Run
CMD ["gunicorn", "rag_backend.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--timeout", "60", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
