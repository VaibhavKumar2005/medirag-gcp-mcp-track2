# MediRAG — Architecture Deep-Dive

> **Track 2 · Model Context Protocol · Gen AI Academy APAC Edition**  
> GCP-native clinical RAG with dual-agent faithfulness verification

---

## Table of contents

1. [System overview](#1-system-overview)
2. [Technology stack](#2-technology-stack)
3. [Service topology](#3-service-topology)
4. [Secret management](#4-secret-management)
5. [The dual-agent pipeline](#5-the-dual-agent-pipeline)
6. [PDF ingestion flow](#6-pdf-ingestion-flow)
7. [RAG query flow](#7-rag-query-flow)
8. [MCP architecture](#8-model-context-protocol-architecture)
9. [Observability](#9-observability)
10. [Failure modes](#10-failure-modes--resilience)

---

## 1. System overview

MediRAG is a Retrieval-Augmented Generation platform built specifically for clinical document Q&A. Its defining feature is the **Dual-Agent Verification Protocol**: every AI response is cross-checked by a Critic Agent before reaching the user, and a quantitative Faithfulness Score is attached to every answer.

```
┌─────────────────────────────────────────────────────────────┐
│           React 19 Frontend  ·  Nginx  ·  Cloud Run         │
│   Clinical Agent  ·  Patient Records  ·  Analytics          │
└───────────────────────────┬─────────────────────────────────┘
                            │  HTTPS / JWT
                            ▼
┌─────────────────────────────────────────────────────────────┐
│       Django REST Framework  ·  Cloud Run                   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            rag_logic.py  —  AI Engine                 │  │
│  │                                                      │  │
│  │  Generator (Gemini 1.5 Flash) ──► Critic Agent       │  │
│  │                                   (cosine similarity) │  │
│  │        ↓ fallback                                    │  │
│  │  Fallback (Groq / Llama-3.3-70B)                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  PostgreSQL + pgvector  ·  Redis  ·  GCP Secret Manager     │
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│      MCP Server  ·  FastMCP  ·  Cloud Run  ·  port 8000     │
│  search_documents · rag_query · list_documents              │
│  get_document_chunks · get_rag_metrics                      │
└───────────────────────────┬─────────────────────────────────┘
                            │  Streamable HTTP (MCP 2025-03-26)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│      ADK Agent  ·  google-adk  ·  Cloud Run  ·  port 8080   │
│  LlmAgent  ·  McpToolset  ·  gemini-1.5-flash-latest        │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19, Vite 7, Tailwind CSS | Clinical dashboard with live faithfulness display |
| **Backend** | Django 5.0, DRF, SimpleJWT | REST API, multi-tenant document isolation |
| **Primary LLM** | Google Gemini 1.5 Flash | JSON-mode generation, temperature 0.1 |
| **Fallback LLM** | Groq / Llama-3.3-70B | Auto-failover on faithfulness rejection |
| **Embeddings** | Google `text-embedding-004` | 768-dim vectors, LangChain integration |
| **Vector DB** | PostgreSQL 16 + pgvector | Cosine similarity search on document chunks |
| **MCP Server** | FastMCP (Streamable HTTP) | 5 clinical RAG tools via MCP protocol |
| **ADK Agent** | google-adk LlmAgent | Orchestrates MCP tool calls |
| **Task Queue** | Celery + Redis | Async PDF ingestion pipeline |
| **Secrets** | GCP Secret Manager (cloud) / HashiCorp Vault (local) | No API keys in env vars |
| **Metrics** | Prometheus + Grafana, OpenTelemetry | Hallucination rate, failover count, latency |
| **CI/CD** | GitHub Actions + OIDC | Workload Identity Federation — keyless |
| **Infrastructure** | Cloud Run (all services), Docker multi-stage | Serverless, non-root containers |

---

## 3. Service topology

### Cloud Run (production)

```
GitHub Actions
    │  OIDC (no keys stored)
    ▼
Cloud Build → Artifact Registry
    │
    ├── verirag-mcp-server   (Django + FastMCP, port 8000)
    ├── verirag-adk-agent    (google-adk FastAPI, port 8080)
    └── verirag-frontend     (React + Nginx, port 8080)
         │
         └── Each service: non-root user, multi-stage Dockerfile,
             python:3.11-slim-bookworm base
```

### Docker Compose (local development)

```
rag-network (bridge)
    │
    ├── rag-backend     :8000  Django API
    ├── rag-worker             Celery worker
    ├── rag-beat               Celery Beat scheduler
    ├── rag-db          :5432  PostgreSQL 16 + pgvector
    ├── rag-redis       :6379  Redis 7
    ├── rag-vault       :8200  HashiCorp Vault (local secrets)
    ├── rag-prometheus  :9090  Metrics scraper
    └── rag-grafana     :3000  Dashboards
```

---

## 4. Secret management

### Dual-mode secret retrieval

```python
# rag_logic.py — get_api_key_from_vault()

if DEPLOY_MODE == "cloud" and GCP_PROJECT_ID:
    # Cloud Run → GCP Secret Manager (Workload Identity)
    # No credentials in the container — IAM handles access
    client = secretmanager.SecretManagerServiceClient()
    name   = f"projects/{GCP_PROJECT_ID}/secrets/{key_name}/versions/latest"
    return client.access_secret_version(request={"name": name})
else:
    # Local dev → HashiCorp Vault KV v2
    client = hvac.Client(url=VAULT_ADDR, token=VAULT_TOKEN)
    return client.secrets.kv.v2.read_secret_version(path="myapp")
```

**5-minute in-process cache** prevents hammering the secret backend on every request.

### The golden rule

API keys (`GOOGLE_API_KEY`, `GROQ_API_KEY`) **never** appear in:
- `.env` files committed to Git
- Docker images or build args
- GitHub secrets (beyond the Workload Identity provider reference)

---

## 5. The dual-agent pipeline

### Stage 1 — Context retrieval

```python
docs = vector_db.similarity_search(
    query, k=5,
    filter={"user_id": str(user_id)}   # Multi-tenant isolation
)
```

- **Embedding model:** `text-embedding-004` (768 dimensions)
- **Chunking:** `RecursiveCharacterTextSplitter` — 1000-char chunks, 200-char overlap
- **Metadata per chunk:** `user_id`, `document_id`, `document_title`, `chunk_index`, `page`

---

### Stage 2 — Primary generation (Gemini 1.5 Flash)

```python
model = genai.GenerativeModel(
    model_name="gemini-1.5-flash",
    generation_config=genai.GenerationConfig(
        temperature=0.1,
        response_mime_type="application/json",
    ),
)
```

System prompt enforces: use only information in the provided context. Never fabricate.

Output schema: `answer`, `faithfulness_score`, `explanation`, `source_citation`.

---

### Stage 3 — Critic Agent (faithfulness verification)

```python
# verify_faithfulness() in rag_logic.py
answer_emb  = embedding_model.embed_query(answer)
context_emb = embedding_model.embed_query(context)
score = cosine_similarity([answer_emb], [context_emb])[0][0]

combined = initial_score * 0.6 + semantic_score * 0.4
```

Using the same `text-embedding-004` model means the Critic is checking semantic overlap — not just word overlap. It catches subtle hallucinations that heuristic approaches miss.

---

### Stage 4 — Fallback (Groq / Llama-3.3-70B)

Triggered when `combined_score < 0.6`:

```python
# VERIFICATION_REJECTIONS counter incremented
# Stricter prompt sent to Groq:
#   "Previous response failed verification."
#   "State ONLY facts directly quoted in the context."
#   "If unsure, say you cannot answer."

client = OpenAI(api_key=groq_key, base_url="https://api.groq.com/openai/v1")
response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    response_format={"type": "json_object"},
    temperature=0.1,
)
```

Using a different model for regeneration provides architectural redundancy — if Gemini hallucinated on a specific query, Llama-3 with a tighter prompt is less likely to reproduce the same hallucination.

---

### Stage 5 — Response

Every answer returns the same standardised shape:

```json
{
  "answer": "Patient has a documented penicillin allergy (anaphylaxis, 2019).",
  "faithfulness_score": 0.91,
  "verification_passed": true,
  "model_used": "gemini",
  "source_citation": "Patient_History.pdf (Page 3)",
  "evidence_items": [...],
  "context_chunks_used": 5,
  "evaluation": {
    "faithfulness": 0.91,
    "answer_relevancy": 0.88,
    "context_precision": 0.85,
    "combined_score": 0.89
  },
  "latency_ms": 1240
}
```

---

### LLM failover diagram

```
Incoming prompt
      │
      ▼
 Gemini 1.5 Flash ──── success ──▶ return (model_used: "gemini")
      │
      │ exception (rate limit / API error)
      ▼
 Groq Llama-3 ──── success ──▶ return (model_used: "groq")
      │            LLM_FALLBACKS.inc()
      │
      │ exception
      ▼
 Error JSON ──▶ "All AI providers unavailable" (model_used: "error")
                Never crashes, always returns a structured response
```

---

## 6. PDF ingestion flow

```
User uploads PDF via frontend
         │
         ▼
POST /api/documents/  →  DocumentViewSet.perform_create()
         │
         ▼
Django saves file  →  Document(processed=False, status=QUEUED)
         │
         ▼
ingest_document_task.delay(doc_id)   ← Celery async task
         │
         ├── PyPDFLoader  →  extract text per page
         │
         ├── RecursiveCharacterTextSplitter
         │   chunk_size=1000, overlap=200
         │   separators: ["\n\n", "\n", ". ", " ", ""]
         │
         ├── Metadata enrichment
         │   {user_id, document_id, document_title, chunk_index}
         │
         ├── GoogleGenerativeAIEmbeddings (text-embedding-004)
         │   Batched: 32 chunks/batch, 1.5s pause between batches
         │   Retry on 429 with exponential backoff
         │
         ├── PGVector.from_documents()  →  store in PostgreSQL
         │
         └── Document(processed=True, status=INDEXED, progress=100%)
             DOCUMENTS_INGESTED.inc()
```

Frontend polls `GET /api/documents/{id}/` every 2 seconds to show live progress through stages: uploading → extracting → vectorizing → indexed.

---

## 7. RAG query flow

```
POST /api/query/  {"query": "What medications is the patient taking?"}
         │
         ▼
query_llm() view  →  get_verified_answer(query, user_id)
         │
         ├── 1. pgvector similarity_search(query, k=5, filter=user_id)
         │
         ├── 2. Build context from top-5 chunks with source citations
         │
         ├── 3. call_llm_with_fallback(generation_prompt)
         │      └── Gemini 1.5 Flash (JSON mode, temp=0.1)
         │          ↓ fails → Groq Llama-3.3-70B
         │
         ├── 4. Parse JSON response
         │
         ├── 5. verify_faithfulness(answer, context, query)
         │      └── Cosine similarity via text-embedding-004
         │          combined = llm_score×0.6 + semantic×0.4
         │
         ├── 6. If combined < 0.6:
         │      VERIFICATION_REJECTIONS.inc()
         │      → Strict prompt to Groq for regeneration
         │
         ├── 7. evaluate_with_ragas()  (graceful fallback if unavailable)
         │
         └── 8. Return full response JSON with all metrics
```

---

## 8. Model Context Protocol architecture

### MCP Server (`apps/backend/mcp_server.py`)

FastMCP exposes five tools via Streamable HTTP transport (MCP spec 2025-03-26):

| Tool | Parameters | Returns |
|---|---|---|
| `search_documents` | `query`, `top_k` | Ranked chunks with metadata + scores |
| `rag_query` | `question`, `user_id` | Full verified answer with faithfulness score |
| `list_documents` | — | All indexed docs with chunk counts |
| `get_document_chunks` | `doc_id`, `limit` | Raw text segments |
| `get_rag_metrics` | — | Live system health snapshot |

Mounted at `/mcp` under a FastAPI outer app so `uvicorn mcp_server:app` works cleanly:

```python
app = FastAPI(title="MediRAG MCP Server")
app.mount("/mcp", mcp.http_app())   # Streamable HTTP transport
```

### ADK Agent (`verirag-adk-agent/verirag_adk_agent.py`)

```python
agent = LlmAgent(
    name="medirag-assistant",
    model="models/gemini-1.5-flash-latest",
    instruction=SYSTEM_PROMPT,
    tools=[
        McpToolset(
            connection_params=StreamableHTTPConnectionParams(
                url=MCP_SERVER_URL   # injected via Cloud Run env var
            )
        )
    ],
)
```

The ADK agent receives `MCP_SERVER_URL` at deploy time from the GitHub Actions workflow output of the MCP Server deploy step, ensuring services are always wired correctly.

---

## 9. Observability

### Prometheus metrics

| Metric | Type | Description |
|---|---|---|
| `verirag_hallucination_rejections_total` | Counter | Critic Agent rejections |
| `verirag_llm_fallbacks_total` | Counter | Gemini → Groq failovers |
| `verirag_queries_total` | Counter | Total RAG queries |
| `verirag_documents_ingested_total` | Counter | PDFs vectorized |
| `verirag_faithfulness_score` | Histogram | Distribution of combined scores |
| `verirag_active_model` | Gauge | Active LLM (1=Gemini, 2=Groq) |

### Health endpoint

`GET /api/health/` — public, no auth required.

Checks PostgreSQL (`SELECT 1`), Redis (`ping()`), and either GCP Secret Manager (cloud) or HashiCorp Vault (local). Returns `200 OK` or `503` with component-level detail.

### CostOps / QualityOps / DriftOps

Every query response triggers three background assessments (non-blocking, failures suppressed):

- **CostOps** — logs model + token usage per request
- **QualityOps** — evaluates faithfulness, relevancy, and context precision
- **DriftOps** — tracks response pattern drift over time and fires alerts

---

## 10. Failure modes & resilience

| Failure | Impact | Mitigation |
|---|---|---|
| GCP Secret Manager unreachable | Cannot fetch API keys | 5-min in-process cache; env var fallback in dev |
| Gemini API rate limited | Primary LLM slows | Exponential backoff (2 retries); Groq auto-failover |
| Gemini API down | Primary LLM offline | Automatic failover to Groq; `LLM_FALLBACKS` incremented |
| Groq API down | Backup LLM offline | Structured error JSON returned; never crashes |
| Both LLMs down | No AI responses | `"model_used": "error"` — user sees clear message |
| Low faithfulness | Potential hallucination | Score < 0.6 triggers Groq regeneration with strict prompt |
| PostgreSQL down | No data access | Health endpoint returns 503; Django retries connection |
| Redis down | Celery tasks stop | Tasks queue on restart; health endpoint flags status |
| PDF extraction fails | Document not indexed | Celery task retries 3× with exponential backoff; `status=FAILED` set |
| Cloud Run cold start | gRPC init latency | `--cpu-boost`, `--no-cpu-throttling`, `--min-instances=1` for MCP server |

---

*MediRAG · Team 96 · Gen AI Academy APAC · Track 2 — Model Context Protocol*
