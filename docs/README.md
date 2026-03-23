<div align="center">

# MediRAG — Documentation

**Track 2 · Model Context Protocol · Gen AI Academy APAC Edition**

</div>

---

## Quick links

| Document | What's inside |
|---|---|
| **[Root README](../README.md)** | Project overview, quickstart, Track 2 alignment |
| **[Architecture deep-dive](ARCHITECTURE.md)** | Five-stage pipeline, code-level detail, failure modes |
| **[GCP Setup](../OIDC_SETUP_COMPLETE.md)** | Workload Identity Federation + OIDC configuration |

---

## Try it instantly

**No account required.** Visit the deployed frontend and click **"Try Demo — No account needed"**.

Three clinical scenarios are pre-indexed and ready:

```
Scenario 1 — Acute chest pain (penicillin allergy documented)
  → "What allergies does this patient have?"
  → "What medications are contraindicated?"

Scenario 2 — Post-CABG discharge summary
  → "What medications were prescribed on discharge?"
  → "What follow-up is required?"

Scenario 3 — Comprehensive metabolic panel
  → "Which lab values were outside normal range?"
  → "What diagnosis is indicated?"
```

Or use the API directly:

```bash
# Get a demo JWT (no password required)
curl https://verirag-mcp-server-[hash].a.run.app/api/demo/token/

# Seed the clinical scenarios
curl -X POST https://verirag-mcp-server-[hash].a.run.app/api/demo/seed/ \
  -H "Authorization: Bearer <token>"

# Ask a clinical question
curl -X POST https://verirag-mcp-server-[hash].a.run.app/api/query/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "What allergies does the patient have?"}'
```

---

## Live services

| Service | Cloud Run URL | Health check |
|---|---|---|
| **Frontend** | `https://verirag-frontend-[hash].a.run.app` | — |
| **Django API + MCP** | `https://verirag-mcp-server-[hash].a.run.app` | `/health` |
| **ADK Agent** | `https://verirag-adk-agent-[hash].a.run.app` | `/health` |

---

## MCP tools exposed

The MCP Server (`apps/backend/mcp_server.py`) exposes five tools via Streamable HTTP transport:

| Tool | What it does |
|---|---|
| `search_documents` | Semantic similarity search across pgvector — returns ranked chunks with content previews |
| `rag_query` | Full dual-agent RAG pipeline — retrieves context, generates answer, scores faithfulness, triggers fallback if needed |
| `list_documents` | Lists all indexed documents with chunk counts (N+1 safe — single annotated query) |
| `get_document_chunks` | Returns raw text segments from a specific document |
| `get_rag_metrics` | Live system health: record counts, active model, embedding dimensions, faithfulness threshold |

---

## Dual-agent verification — the core differentiator

```
Gemini 1.5 Flash generates answer
          ↓
Critic Agent scores it:
  • Embeds answer + context with text-embedding-004
  • Computes cosine similarity
  • Combined score = 60% self-reported + 40% semantic
          ↓
Score ≥ 0.6  →  Return to user with citations
Score < 0.6  →  Reject → Groq/Llama-3 regenerates with strict prompt
```

**Why this matters in healthcare:** A system that invents drug dosages, misreports lab results, or fabricates diagnoses isn't just wrong — it's dangerous. MediRAG refuses to answer rather than hallucinate.

---

## Deployment pipeline

```
Push to track-2-mcp-submission
          ↓
GitHub Actions (OIDC — no stored credentials)
          ↓
Cloud Build → Docker multi-stage build
          ↓
Artifact Registry → Cloud Run deploy
          ↓
  ┌───────────────┐
  │  3 services   │
  │  MCP Server   │  port 8000  (Django + FastMCP)
  │  ADK Agent    │  port 8080  (google-adk + FastAPI)
  │  Frontend     │  port 8080  (React + Nginx)
  └───────────────┘
```

Authentication between GitHub Actions and GCP uses **Workload Identity Federation** — short-lived OIDC tokens, no JSON key files stored anywhere.

---

## Local development

```bash
git clone https://github.com/VaibhavKumar2005/verirag-gcp-mcp-track2.git
cd verirag-gcp-mcp-track2
cp .env.example .env        # Set GOOGLE_API_KEY + DJANGO_SECRET_KEY
docker compose up --build
```

| Service | Local URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000/api/ |
| Swagger UI | http://localhost:8000/api/schema/swagger-ui/ |
| MCP health | http://localhost:8001/health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 |

---

## Observability

Prometheus metrics at `/metrics`:

| Metric | Description |
|---|---|
| `verirag_hallucination_rejections_total` | Responses rejected by the Critic Agent |
| `verirag_llm_fallbacks_total` | Gemini → Groq failover events |
| `verirag_queries_total` | Total RAG queries |
| `verirag_documents_ingested_total` | PDFs vectorized |
| `verirag_faithfulness_score` | Histogram of combined faithfulness scores |
| `verirag_active_model` | Currently active LLM (1=Gemini, 2=Groq) |

---

<div align="center">

**MediRAG · Team 96 · Gen AI Academy APAC · Track 2**

</div>
