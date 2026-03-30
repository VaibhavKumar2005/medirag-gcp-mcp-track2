# MediRAG

Clinical document intelligence that refuses to guess.

MediRAG is a Google Cloud-based RAG system for patient-record PDFs. It combines OCR, semantic retrieval, a verification gate, and an ADK agent that calls MCP tools over Streamable HTTP. The project is designed for scenarios where a confident but ungrounded answer is unacceptable.

---

## What It Includes

- `apps/backend/`: Django API, ingestion pipeline, RAG logic, and FastMCP server
- `apps/frontend/`: React dashboard for upload, querying, and demo flows
- `verirag-adk-agent/`: Google ADK agent that consumes the MCP server
- `docker-compose.yml`: Local multi-service stack

---

## Core Flow

1. A user uploads a PDF.
2. The backend extracts text, using OCR when needed.
3. Content is chunked and embedded into PostgreSQL with `pgvector`.
4. A query retrieves relevant chunks.
5. Gemini generates an answer.
6. A verification stage scores faithfulness against the retrieved context.
7. If the score is too low, the system falls back to a stricter model or refuses to answer.

---

## Main Components

### Backend
- Django + DRF application
- Celery worker for background ingestion
- PostgreSQL + `pgvector`
- FastMCP server exposing tool endpoints such as `search_documents`, `rag_query`, and `get_rag_metrics`

### Frontend
- React 19 + Vite dashboard
- Clinical-style query UI
- Demo and analytics views

### ADK Agent
- Google ADK `SequentialAgent`
- Uses `McpToolset` to call the backend MCP server
- Intended as the primary Track 2 demonstration surface

---

## Local Development

### Prerequisites

- Docker Desktop
- A populated `.env` file based on `.env.example`
- Google API credentials for Gemini and, if used, OCR-related services

### Start the stack

```bash
docker-compose up -d --build
```

### Common local URLs

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- MCP endpoint: `http://localhost:8000/mcp`

---

## Key Docs

- `DOCUMENTATION_INDEX.md`: navigation for the full doc set
- `PROJECT_SUMMARY.md`: concise product and architecture summary
- `ARCHITECTURE_REFERENCE.md`: visual system reference
- `QUICK_IMPLEMENTATION_GUIDE.md`: developer setup and extension guide
- `TESTING_GUIDE.md`: local and live validation steps
- `SUBMISSION.md`: judge-facing Track 2 summary

---

## Current Documentation Notes

This repository contains some older exploratory design material alongside the current product docs. The files listed above are the best sources of truth for the present MediRAG implementation.
