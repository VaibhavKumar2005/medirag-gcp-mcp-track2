FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --prefix=/install -r requirements.txt

FROM python:3.11-slim AS runtime

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

COPY --chown=verirag:verirag manage.py         ./manage.py
COPY --chown=verirag:verirag mcp_server.py     ./mcp_server.py
COPY --chown=verirag:verirag setup_pgvector.py ./setup_pgvector.py
COPY --chown=verirag:verirag requirements.txt  ./requirements.txt
COPY --chown=verirag:verirag rag_backend/      ./rag_backend/
COPY --chown=verirag:verirag ai_engine/        ./ai_engine/

RUN mkdir -p /app/media/pdfs /app/staticfiles \
    && chown -R verirag:verirag /app

USER verirag

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/api/health/ || exit 1

CMD ["sh", "-c", "uvicorn mcp_server:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
