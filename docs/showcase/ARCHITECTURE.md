<div align="center">

# MediRAG — Architecture Showcase

**Track 2 · Model Context Protocol · Gen AI Academy APAC Edition**

*A dual-agent, hallucination-resistant clinical RAG platform — deployed serverless on Google Cloud Run*

</div>

---

## What MediRAG does

MediRAG lets clinicians query patient medical records in plain language and receive **verified, citation-backed answers**. The defining innovation is that every response is checked for faithfulness before reaching the user — and automatically regenerated if it doesn't pass.

> In healthcare, an AI that invents a drug dosage, fabricates a diagnosis, or misreports a lab value isn't just wrong. It's dangerous. MediRAG's architecture is built around one principle: **refuse to answer rather than guess.**

---

## The dual-agent verification protocol

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   User: "Is this patient allergic to penicillin?"          │
│                                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
              pgvector similarity search
              top-5 chunks retrieved (user-isolated)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              PRIMARY AGENT — Gemini 1.5 Flash               │
│                                                             │
│  Temperature: 0.1 · JSON mode · Context-only constraint     │
│                                                             │
│  Output: answer + self-reported faithfulness score          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    CRITIC AGENT                             │
│                                                             │
│  text-embedding-004 embeds both answer and context          │
│  Cosine similarity computed                                 │
│  Combined score = 60% self-reported + 40% semantic          │
└───────────────┬───────────────────────────┬─────────────────┘
                │                           │
          score ≥ 0.6                 score < 0.6
                │                           │
                ▼                           ▼
     ✅ Return to user           ❌ REJECT — trigger fallback
     with citations
                                            │
                                            ▼
                            ┌───────────────────────────────┐
                            │  FALLBACK — Groq Llama-3.3-70B │
                            │                               │
                            │  Strict prompt:               │
                            │  "Quote only facts directly   │
                            │   present in the context.     │
                            │   If unsure, say so."         │
                            └───────────────────────────────┘
```

---

## System architecture

### Three Cloud Run services

```
GitHub Actions  (OIDC — no stored credentials)
       │
       ▼
Cloud Build  →  Artifact Registry  →  Cloud Run
                                           │
            ┌──────────────────────────────┴──────────────────────────┐
            │                                                          │
   ┌────────▼────────┐    ┌────────────────────┐    ┌───────────────▼──┐
   │  MCP Server     │    │    ADK Agent        │    │   Frontend       │
   │  Django + FastMCP│   │  google-adk         │    │  React + Nginx   │
   │  port 8000      │◄───│  + FastAPI          │    │  port 8080       │
   │                 │    │  port 8080          │    │                  │
   │  5 MCP tools    │    │  LlmAgent           │    │  Clinical Agent  │
   │  via HTTP       │    │  McpToolset         │    │  Patient Records │
   └────────┬────────┘    └────────────────────┘    │  Analytics       │
            │                                       └──────────────────┘
            │
   ┌────────▼────────────────────────────────────┐
   │  PostgreSQL 16 + pgvector                   │
   │  text-embedding-004  ·  768 dimensions       │
   │  Cosine similarity search on document chunks │
   └─────────────────────────────────────────────┘
```

### MCP tools available to the ADK agent

| Tool | What it does |
|---|---|
| `search_documents` | Semantic similarity search via pgvector |
| `rag_query` | Full dual-agent verification pipeline |
| `list_documents` | All indexed records with chunk counts |
| `get_document_chunks` | Raw text segments from any document |
| `get_rag_metrics` | Live system health and model config |

---

## Google Cloud services used

| Service | Role |
|---|---|
| **Cloud Run** | Serverless containers for all 3 services |
| **Cloud Build** | Triggered by GitHub Actions OIDC — builds Docker images |
| **Artifact Registry** | Stores Python 3.11-slim multi-stage images |
| **Cloud SQL / pgvector** | Vector store + relational data |
| **GCP Secret Manager** | API keys retrieved at runtime via Workload Identity |
| **Cloud Logging** | Structured audit trail (log injection sanitised) |
| **Workload Identity Federation** | OIDC keyless auth — no JSON key files |
| **Google Gemini API** | Primary LLM + embedding model |

---

## Security architecture

### Keyless CI/CD with Workload Identity Federation

```
GitHub Actions workflow triggered
         │
         │  OIDC token issued by GitHub
         ▼
GCP validates token against WIF pool
(bound to: repo/branch/workflow)
         │
         │  Short-lived access token issued
         ▼
Cloud Build triggered with temporary credentials
         │
         ▼
Cloud Run service deployed
         │
Credentials expire automatically (< 1 hour)
```

No JSON service account keys are stored in GitHub secrets. No credentials exist in Docker images or `.env` files.

### Data isolation

Every document chunk carries `user_id` metadata. Every pgvector query filters by it:

```python
docs = vector_db.similarity_search(
    query, k=5,
    filter={"user_id": str(current_user.id)}
)
```

Two clinicians' patient records never appear in each other's results.

### Log injection prevention (CWE-117)

```python
def sanitize_log_input(text: str, max_length: int = 200) -> str:
    return re.sub(r"[\r\n]", "_", str(text))[:max_length]
```

Applied to all user-controlled inputs before they reach Cloud Logging.

---

## Ingestion pipeline

```
PDF uploaded by clinician
         │
         ▼
Django saves file  →  Document queued
         │
Celery worker picks up task
         │
         ├── PyPDF extracts text (per page)
         ├── RecursiveCharacterTextSplitter  (1000 chars / 200 overlap)
         ├── Metadata: user_id · document_id · document_title · page
         ├── text-embedding-004 generates 768-dim vectors
         │   Batched: 32 chunks/batch · retry on rate limit
         └── PGVector stores vectors in PostgreSQL
                   │
                   ▼
         Document status: INDEXED
         Frontend polls every 2s and shows live progress
```

---

## Observability

All metrics exposed at `/metrics` and visualised in Grafana:

| Metric | What it reveals |
|---|---|
| `verirag_hallucination_rejections_total` | How often the Critic Agent catches a bad answer |
| `verirag_llm_fallbacks_total` | Gemini → Groq failover rate |
| `verirag_faithfulness_score` histogram | Distribution of answer quality across all queries |
| `verirag_queries_total` | System load |
| `verirag_active_model` gauge | Which LLM is currently serving requests |

---

## Why this matters for APAC healthcare

Across India and Southeast Asia, most hospital records are on paper. When they're digitised, clinicians need to query them fast — during emergency rounds, before prescribing, when a patient can't communicate their history.

A hallucinating AI in this context doesn't fail gracefully. It fabricates penicillin allergies that don't exist, or misses ones that do. It invents drug dosages. It fabricates diagnoses.

MediRAG's dual-agent architecture exists to make one guarantee: **if the answer isn't in the documents, the system says so.**

---

<div align="center">

**MediRAG · Team 96 · Gen AI Academy APAC Edition · Track 2 — Model Context Protocol**

</div>
