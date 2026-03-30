# MediRAG Quick Implementation Guide

---

## Local Setup

1. Copy `.env.example` to `.env`.
2. Fill in the required API keys and database settings.
3. Start the local stack:

```bash
docker-compose up -d --build
```

4. Confirm the main services respond:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000/health/`
- MCP: `http://localhost:8000/mcp`

---

## What To Build Or Verify First

### Backend
- Confirm document upload works
- Confirm ingestion creates chunks and embeddings
- Confirm `rag_query` returns a grounded answer
- Confirm `get_rag_metrics` reports healthy state

### Frontend
- Confirm dashboard loads
- Confirm demo auth flow works
- Confirm upload and query results render correctly

### ADK agent
- Confirm the agent can reach the MCP endpoint
- Confirm the expected tool calls occur in sequence

---

## Core Files To Know

- `apps/backend/mcp_server.py`
- `apps/backend/ai_engine/views.py`
- `apps/backend/ai_engine/rag_logic.py`
- `apps/backend/rag_backend/settings.py`
- `apps/frontend/src/Dashboard.jsx`
- `verirag-adk-agent/medirag_agent/agent.py`

---

## Common Dev Workflow

1. Start the stack with Docker.
2. Upload a known test PDF.
3. Watch worker logs while ingestion completes.
4. Run a query through the REST API or frontend.
5. Validate the same behavior through the MCP endpoint or ADK agent.

---

## Common Failure Points

| Problem | Likely Cause | First Check |
|---|---|---|
| Upload succeeds but query has no evidence | ingestion or embeddings failed | worker logs and database records |
| MCP endpoint is unavailable | backend mount/config issue | backend health and `mcp_server.py` wiring |
| Query quality is poor | retrieval or threshold tuning issue | `rag_logic.py` and metrics output |
| Demo flow breaks | auth or environment mismatch | `.env`, settings, and frontend API base URL |

---

## Before You Push

- Run the checks in `TESTING_GUIDE.md`
- Re-read `README.md` and `SUBMISSION.md` for drift
- Stage only the files you intentionally changed
- Keep documentation and code changes logically grouped
