# MediRAG Architecture Reference

---

## Service Layout

```text
User / Judge
    |
    v
Frontend Dashboard or ADK Agent
    |
    v
Django API + FastMCP Server
    |
    +--> PostgreSQL + pgvector
    +--> Redis / Celery
    +--> Google AI services
```

---

## Request Flow

```text
Upload PDF
  -> extract text
  -> OCR if needed
  -> chunk content
  -> generate embeddings
  -> store chunks in PostgreSQL

Ask question
  -> retrieve top relevant chunks
  -> generate answer
  -> verify faithfulness
  -> return answer, fallback, or refusal
```

---

## Main Runtime Boundaries

### Frontend
- Handles user interaction, upload flow, and result presentation
- Calls backend REST endpoints

### Backend API
- Owns authentication, uploads, retrieval, and query APIs
- Hosts the FastMCP tool surface

### MCP Server
- Exposes reusable tool operations such as:
  - `search_documents`
  - `rag_query`
  - `get_rag_metrics`

### Worker Layer
- Processes ingestion asynchronously
- Keeps uploads responsive while chunking and embedding run in the background

### Data Layer
- PostgreSQL stores documents, chunks, and retrieval metadata
- `pgvector` supports semantic similarity search

---

## Verification Pipeline

```text
User question
  -> retrieve context
  -> generate draft answer
  -> score faithfulness
  -> accept if above threshold
  -> otherwise retry with stricter fallback or refuse
```

The important architectural point is that retrieval alone is not treated as sufficient. Generation is gated by a verification step before the answer is considered safe enough to return.

---

## Deployment Shape

- Frontend can run as a separate Cloud Run service
- Backend API and MCP server can run together if the deployment is demo-focused
- PostgreSQL and Redis stay external to stateless app containers
- The ADK agent is a separate deployable service that points at the MCP endpoint

---

## Practical Notes

- For demos, a simpler deployment shape is fine as long as the MCP boundary stays visible.
- For production hardening, keep secrets out of the repo, isolate services cleanly, and validate worker, OCR, and vector-store behavior together.
