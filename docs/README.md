# MediRAG — Verified Clinical Intelligence on Google Cloud

> **Track 2 · Model Context Protocol · Gen AI Academy APAC Edition**

MediRAG is a cloud-native RAG platform that lets clinicians query patient medical records in plain language and receive **citation-backed, hallucination-resistant answers**. Every response passes through a dual-agent faithfulness pipeline before reaching the user.

---

## Try it now

| Service | URL |
|---|---|
| Frontend | `https://verirag-frontend-xxxx.a.run.app` |
| MCP Server | `https://verirag-mcp-server-xxxx.a.run.app/health` |
| ADK Agent  | `https://verirag-adk-agent-xxxx.a.run.app/health` |

**No account needed.** Click "Try Demo — No account needed" on the login page. Three pre-indexed clinical scenarios (chest pain, post-CABG discharge, metabolic panel) are loaded instantly so you can test the full pipeline immediately.

Suggested questions to try:
- "What allergies does the patient have?"
- "What medications is the patient currently taking?"
- "What were the key abnormal lab findings?"
- "What is the recommended treatment?"

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              React 19 Frontend (Nginx · Cloud Run)          │
│  Clinical Agent  ·  Patient Records  ·  Analytics           │
└──────────────────────────┬──────────────────────────────────┘
                           │ JWT (SimpleJWT)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           Django REST Framework Backend (Cloud Run)         │
│                                                             │
│   ┌──────────────────────────────────────────────────┐      │
│   │           VeriRAG Dual-Agent Pipeline            │      │
│   │                                                  │      │
│   │  ┌──────────────┐   Faithfulness < 0.6          │      │
│   │  │ Gemini 1.5   │──────────────────────────►    │      │
│   │  │ Flash        │   Reject + regenerate          │      │
│   │  │ (Primary)    │                                │      │
│   │  └──────────────┘   ┌──────────────────────┐    │      │
│   │                     │ Critic Agent          │    │      │
│   │                     │ Semantic cosine sim   │    │      │
│   │                     │ + RAGAS evaluation    │    │      │
│   │                     └──────────────────────┘    │      │
│   │  ┌──────────────┐                               │      │
│   │  │ Groq Llama-3 │◄── Strict prompt fallback     │      │
│   │  │ (Safety net) │                               │      │
│   │  └──────────────┘                               │      │
│   └──────────────────────────────────────────────────┘      │
└──────┬───────────────┬──────────────┬────────────────────────┘
       │               │              │
       ▼               ▼              ▼
  PostgreSQL 16   GCP Secret     Google Cloud
  + pgvector      Manager        Logging + Prometheus
  (768-dim        (API keys)
   embeddings)

┌─────────────────────────────────────────────────────────────┐
│                MCP Server (FastMCP · Cloud Run)              │
│   search_documents · rag_query · list_documents             │
│   get_document_chunks · get_rag_metrics                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ Streamable HTTP (MCP 2025-03-26)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│             ADK Agent (google-adk · Cloud Run)              │
│        LlmAgent · McpToolset · gemini-1.5-flash-latest      │
└─────────────────────────────────────────────────────────────┘
```

### Request lifecycle

1. User uploads a PDF → Django saves it → **Celery worker** ingests it → LangChain chunks text → **Google `text-embedding-004`** generates 768-dim vectors → stored in **pgvector**
2. User asks a clinical question → similarity search in pgvector → **Gemini 1.5 Flash** generates a JSON-structured answer
3. **Critic Agent** scores faithfulness using semantic cosine similarity between answer and retrieved context
4. If score < 0.6 → answer **rejected** → **Groq/Llama-3** regenerates with a stricter, conservative prompt
5. Final response includes: answer, faithfulness score (0–1), source citations, and RAGAS evaluation metrics

---

## Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19, Vite 7, Tailwind CSS | Clinical dashboard with live faithfulness display |
| **Backend** | Django 5.0, DRF | REST API, JWT auth, multi-tenant document isolation |
| **Primary LLM** | Google Gemini 1.5 Flash | JSON-mode generation, safety settings |
| **Fallback LLM** | Groq / Llama-3.3-70B | Automatic failover on faithfulness rejection |
| **Embeddings** | Google `text-embedding-004` | 768-dim vectors for pgvector similarity search |
| **Vector DB** | PostgreSQL 16 + pgvector | Semantic similarity search on document chunks |
| **MCP Server** | FastMCP (Streamable HTTP) | Exposes 5 clinical RAG tools via MCP protocol |
| **ADK Agent** | google-adk, LlmAgent | Orchestrates MCP tool calls via natural language |
| **Task Queue** | Celery + Redis | Async PDF ingestion pipeline |
| **Secrets** | GCP Secret Manager (cloud) / HashiCorp Vault (local) | No API keys in env vars |
| **Observability** | Prometheus + Grafana, OpenTelemetry | Hallucination rate, failover count, latency |
| **CI/CD** | GitHub Actions + OIDC (keyless) | Workload Identity Federation — no stored credentials |
| **Infrastructure** | Cloud Run (all services), Docker multi-stage | Serverless, non-root containers |

---

## Dual-Agent pipeline — what makes this different

Most RAG systems return whatever the LLM says. MediRAG doesn't.

**Primary agent (Gemini 1.5 Flash):**
- Receives top-5 retrieved chunks from pgvector
- Generates a structured JSON response with a self-reported faithfulness score
- Answer must be grounded in the retrieved context only

**Critic Agent (semantic verification):**
- Embeds both the answer and the retrieved context using `text-embedding-004`
- Computes cosine similarity — this detects subtle hallucinations that word-overlap heuristics miss
- Combined score = 60% self-reported + 40% semantic similarity

**Fallback (Groq/Llama-3):**
- Triggered when combined score < 0.6
- Uses a strictly constrained prompt: quote only facts directly in the context
- If still uncertain, returns "I cannot answer from the available documents"

In a clinical setting, this means the system refuses to invent drug dosages, allergy information, or diagnoses that aren't in the uploaded records.

---

## Local development

### Prerequisites

- Docker Desktop
- Google API Key — [Get one](https://aistudio.google.com/app/apikey)
- Groq API Key (optional, for fallback) — [Get one](https://console.groq.com/)

### Setup

```bash
git clone https://github.com/VaibhavKumar2005/cloud-native-ai-library-system.git
cd cloud-native-ai-library-system
cp .env.example .env
# Edit .env — set GOOGLE_API_KEY and DJANGO_SECRET_KEY at minimum
docker compose up --build
```

Frontend: http://localhost:5173  
Backend API: http://localhost:8000/api/  
MCP Server: http://localhost:8001/health  
Grafana: http://localhost:3000

### Demo mode (local)

With `DEMO_MODE=True` in `.env`:

```bash
# Get a demo JWT
curl http://localhost:8000/api/demo/token/

# Seed sample clinical documents
curl -X POST http://localhost:8000/api/demo/seed/ \
  -H "Authorization: Bearer <token>"
```

---

## Environment variables

```env
# Required
DJANGO_SECRET_KEY=your-random-secret-key
GOOGLE_API_KEY=AIza...your-google-api-key
GCP_PROJECT_ID=your-gcp-project-id

# Database
POSTGRES_USER=admin
POSTGRES_PASSWORD=devpassword
POSTGRES_DB=medirag_db
POSTGRES_HOST=rag-db
POSTGRES_PORT=5432

# Optional
GROQ_API_KEY=gsk_...             # Enables Llama-3 fallback
GEMINI_MODEL=gemini-1.5-flash    # Override model
DEMO_MODE=True                   # Enable judge demo access
REDIS_URL=redis://rag-redis:6379/0
```

---

## Deployment (GitHub Actions → Cloud Run)

All three services deploy automatically on push to `track-2-mcp-submission`:

```
deploy-mcp-server → deploy-adk-agent → deploy-frontend
```

Authentication uses **Workload Identity Federation** (OIDC) — no service account keys stored in GitHub secrets.

Required secrets:
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

---

## Track 2 alignment

| Requirement | Implementation |
|---|---|
| AI agent using ADK | `verirag-adk-agent/` — `LlmAgent` with `McpToolset` |
| MCP to connect to a tool | FastMCP server exposes 5 clinical RAG tools via Streamable HTTP |
| Retrieves structured data | `search_documents` + `rag_query` return JSON with citations and faithfulness scores |
| Uses retrieved data in response | Full RAG pipeline — answer is generated only from retrieved pgvector chunks |
| Deployed to Cloud Run | All 3 services deployed via GitHub Actions OIDC |

---

## Why clinical AI needs hallucination resistance

In India and across APAC, most hospital records are on paper. When they're digitised, clinicians need to query them quickly — during rounds, in emergencies, before prescribing. A system that invents drug allergies, misreports lab values, or fabricates diagnoses is not just useless: it's dangerous.

MediRAG's faithfulness threshold of 0.6, the dual-agent verification, and the Groq fallback exist for one reason: **the system should refuse to answer rather than guess**.

---

*Team 96 · MediRAG · Gen AI Academy APAC · Track 2*
