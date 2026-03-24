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

RUN apt-get update && apt-get install -y --no-install-recommends \
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

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

RUN groupadd -r medirag && useradd -r -g medirag -d /app -s /sbin/nologin medirag

WORKDIR /app
COPY --chown=medirag:medirag . .

USER medirag

# PORT injected by Cloud Run; default 8080 matches workflow --port=8080
# The app code already reads PORT from env (verirag_adk_agent.py:194) —
# the CMD here must match so Docker EXPOSE and uvicorn agree.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

STOPSIGNAL SIGTERM

CMD ["sh", "-c", "uvicorn verirag_adk_agent:app \
     --host 0.0.0.0 \
     --port ${PORT:-8080} \
     --workers 1 \
     --log-level info"]
