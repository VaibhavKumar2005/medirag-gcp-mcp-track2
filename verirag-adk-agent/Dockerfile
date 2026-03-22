###############################################################################
# MediRAG ADK Agent — Dockerfile for Google Cloud Run
# Uvicorn serves the FastAPI app that wraps the Google ADK LlmAgent.
###############################################################################

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# No C-extension deps needed for the ADK agent (pure Python stack)
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

LABEL maintainer="Vaibhav Kumar" \
      org.opencontainers.image.title="MediRAG ADK Agent" \
      org.opencontainers.image.description="Google ADK Agent connecting to MediRAG MCP Server"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder stage
COPY --from=builder /install /usr/local

# Security: non-root user
RUN groupadd -r medirag && useradd -r -g medirag -d /app -s /sbin/nologin medirag

WORKDIR /app
COPY --chown=medirag:medirag . .

USER medirag

# Cloud Run injects PORT=8080; expose it here for documentation
EXPOSE 8080

# Health check — Cloud Run probes /health before routing traffic
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

STOPSIGNAL SIGTERM

# Uvicorn binds to the module-level `app` object in verirag_adk_agent.py
# --host 0.0.0.0  required by Cloud Run (container must accept external traffic)
# --workers 1     ADK agent is stateful; do not fork multiple workers
CMD ["uvicorn", "verirag_adk_agent:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--workers", "1", \
     "--log-level", "info"]
