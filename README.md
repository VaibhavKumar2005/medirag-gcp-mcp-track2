<div align="center">

<img src="https://img.shields.io/badge/MediRAG-Clinical%20Intelligence-22d3ee?style=for-the-badge&labelColor=040207" />
<img src="https://img.shields.io/badge/Track%202-Model%20Context%20Protocol-a78bfa?style=for-the-badge&labelColor=040207" />
<img src="https://img.shields.io/badge/Google%20Cloud-Run%20Native-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white&labelColor=040207" />
<img src="https://img.shields.io/badge/Gemini%201.5-Flash%20%2B%20Fallback-22c55e?style=for-the-badge&labelColor=040207" />

<br /><br />

# MediRAG

### Verified Clinical Intelligence — Powered by Google Cloud

**A cloud-native RAG platform that answers clinical questions with citation-backed, hallucination-resistant responses.**  
Every answer is scored for faithfulness before it reaches the user. If it doesn't pass, the system regenerates it — or refuses to answer.

[**Try the Demo**](#-try-it-now) · [**Architecture**](#️-architecture) · [**Deploy**](#-deployment) · [**Track 2 Alignment**](#-track-2-alignment)

</div>

---

## ✨ What makes MediRAG different

Most RAG systems return whatever the LLM says. MediRAG doesn't.

Every response passes through a **Dual-Agent Verification Pipeline**:

```
PDF uploaded → vectors stored in pgvector
       ↓
User asks a clinical question
       ↓
Top-5 chunks retrieved via semantic search
       ↓
Gemini 1.5 Flash generates a structured JSON answer
       ↓
Critic Agent scores faithfulness
(semantic cosine similarity of answer vs. context)
       ↓
Score ≥ 0.6 → ✅ Return to user with citations
Score < 0.6 → ❌ Reject → Groq/Llama-3 regenerates with strict prompt
```

In a clinical setting this means: **the system refuses to invent drug dosages, allergy information, or diagnoses that aren't in the uploaded records.**

---

## 🚀 Try it now

| Service | URL |
|---|---|
| **Frontend** | `https://verirag-frontend-[hash].a.run.app` |
| **MCP Server** | `https://verirag-mcp-server-[hash].a.run.app/health` |
| **ADK Agent** | `https://verirag-adk-agent-[hash].a.run.app/health` |

**No account needed.** On the login page, click **"Try Demo — No account needed"**.  
Three pre-indexed clinical scenarios load instantly:

| Scenario | Sample question |
|---|---|
| Acute chest pain + penicillin allergy | *"What allergies does this patient have?"* |
| Post-CABG discharge summary | *"What medications were prescribed on discharge?"* |
| Comprehensive metabolic panel | *"Which lab values were abnormal?"* |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│          React 19 Frontend  ·  Nginx  ·  Cloud Run          │
│     Clinical Agent  ·  Patient Records  ·  Analytics        │
└───────────────────────────┬─────────────────────────────────┘
                            │  JWT (SimpleJWT)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│       Django REST Framework Backend  ·  Cloud Run           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Dual-Agent Verification Pipeline        │   │
│  │                                                     │   │
│  │   Gemini 1.5 Flash ──► Critic Agent (cosine sim)   │   │
│  │        (Primary)         score ≥ 0.6 → return      │   │
│  │             │            score < 0.6 → reject       │   │
│  │             ▼                                       │   │
│  │   Groq / Llama-3.3-70B  (strict fallback prompt)   │   │
│  └─────────────────────────────────────────────────────┘   │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
  PostgreSQL 16   GCP Secret    Prometheus     Celery
  + pgvector      Manager       + Grafana      + Redis
  768-dim         API keys      Observability  Ingestion

┌─────────────────────────────────────────────────────────────┐
│         MCP Server  ·  FastMCP  ·  Cloud Run                │
│  search_documents · rag_query · list_documents              │
│  get_document_chunks · get_rag_metrics                      │
└───────────────────────────┬─────────────────────────────────┘
                            │  Streamable HTTP (MCP 2025-03-26)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│       ADK Agent  ·  google-adk  ·  Cloud Run                │
│   LlmAgent · McpToolset · gemini-1.5-flash-latest           │
└─────────────────────────────────────────────────────────────┘
```

### Request lifecycle

| Step | What happens |
|---|---|
| **1. Ingest** | PDF uploaded → Celery worker → PyPDF extraction → 1000-char chunks → `text-embedding-004` → pgvector |
| **2. Retrieve** | Query embedded → cosine similarity search → top-5 chunks returned (filtered by `user_id`) |
| **3. Generate** | Gemini 1.5 Flash receives chunks + prompt → outputs JSON answer + self-reported faithfulness score |
| **4. Verify** | Critic Agent embeds answer + context → cosine similarity → combined score (60% LLM + 40% semantic) |
| **5. Gate** | Score ≥ 0.6 → return to user; Score < 0.6 → Groq regenerates with stricter prompt |
| **6. Respond** | Answer + faithfulness score + RAGAS metrics + source citations returned |

---

## 🛠️ Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19, Vite 7, Tailwind CSS | Clinical dashboard with live faithfulness display |
| **Backend** | Django 5.0, Django REST Framework | REST API, JWT auth, multi-tenant document isolation |
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
| **Infrastructure** | Cloud Run (all 3 services), Docker multi-stage | Serverless, non-root containers |

---

## 💻 Local development

### Prerequisites

- Docker Desktop
- Google API Key — [Get one](https://aistudio.google.com/app/apikey)
- Groq API Key (optional, for fallback) — [Get one](https://console.groq.com/)

### Quickstart

```bash
git clone https://github.com/VaibhavKumar2005/verirag-gcp-mcp-track2.git
cd verirag-gcp-mcp-track2
cp .env.example .env
# Edit .env — set GOOGLE_API_KEY and DJANGO_SECRET_KEY at minimum
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000/api/ |
| MCP Server | http://localhost:8001/health |
| Grafana | http://localhost:3000 |

### Demo mode (local)

```bash
# 1. Get a demo JWT — no password required
curl http://localhost:8000/api/demo/token/

# 2. Pre-load the 3 clinical scenarios
curl -X POST http://localhost:8000/api/demo/seed/ \
  -H "Authorization: Bearer <token_from_step_1>"
```

---

## ⚙️ Environment variables

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
GROQ_API_KEY=gsk_...          # Enables Llama-3 fallback
GEMINI_MODEL=gemini-1.5-flash # Override primary model
DEMO_MODE=True                # Enable judge demo access
REDIS_URL=redis://rag-redis:6379/0
```

---

## 🚢 Deployment

Three services deploy automatically on push to `track-2-mcp-submission`:

```
deploy-mcp-server → deploy-adk-agent → deploy-frontend
```

Authentication uses **Workload Identity Federation** (OIDC keyless) — no service account JSON keys stored anywhere.

Required GitHub secrets:
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

---

## 📋 Track 2 alignment

| Requirement | Where it's implemented |
|---|---|
| AI agent using ADK | `verirag-adk-agent/verirag_adk_agent.py` — `LlmAgent` with `McpToolset` |
| MCP to connect to a tool | `apps/backend/mcp_server.py` — FastMCP, 5 tools, Streamable HTTP transport |
| Retrieves structured data | `search_documents` + `rag_query` return JSON with citations and faithfulness scores |
| Uses retrieved data in final response | RAG pipeline: answer generated exclusively from retrieved pgvector chunks |
| Deployed to Cloud Run | All 3 services: GitHub Actions → Cloud Build → Cloud Run (OIDC auth) |

---

## 📁 Project structure

```
verirag-gcp-mcp-track2/
├── apps/
│   ├── backend/                  # Django REST API
│   │   ├── ai_engine/
│   │   │   ├── rag_logic.py      # Dual-agent verification pipeline
│   │   │   ├── views.py          # API endpoints + demo mode
│   │   │   ├── models.py         # Document model (multi-tenant)
│   │   │   └── tasks.py          # Celery ingestion tasks
│   │   ├── mcp_server.py         # FastMCP server (5 clinical tools)
│   │   ├── Dockerfile            # Django / Gunicorn
│   │   └── Dockerfile.mcp        # MCP Server / Uvicorn
│   └── frontend/                 # React 19 + Vite 7
│       └── src/
│           ├── Dashboard.jsx     # Live chat + real upload + analytics
│           ├── Login.jsx         # Demo one-click access
│           └── LandingPage.jsx   # Public landing page
├── verirag-adk-agent/
│   ├── verirag_adk_agent.py      # ADK LlmAgent + McpToolset
│   ├── Dockerfile                # Uvicorn entrypoint
│   └── requirements.txt          # Minimal ADK deps
├── docs/
│   ├── README.md                 # Full hackathon documentation
│   └── ARCHITECTURE.md           # Deep-dive technical reference
├── ops/
│   ├── helm/                     # Helm charts
│   └── monitoring/               # Grafana dashboards + alert rules
├── .github/workflows/
│   └── track-2-google-submission.yml  # CI/CD pipeline
├── docker-compose.yml            # Local development
└── .env.example                  # Environment template
```

---

## 📊 Observability

Prometheus metrics exposed at `/metrics`:

| Metric | Type | What it measures |
|---|---|---|
| `verirag_hallucination_rejections_total` | Counter | Responses rejected by the Critic Agent |
| `verirag_llm_fallbacks_total` | Counter | Gemini → Groq failover events |
| `verirag_queries_total` | Counter | Total RAG queries processed |
| `verirag_documents_ingested_total` | Counter | PDFs successfully vectorized |
| `verirag_faithfulness_score` | Histogram | Distribution of combined faithfulness scores |
| `verirag_active_model` | Gauge | Currently active LLM (1 = Gemini, 2 = Groq) |

---

## 💡 Why clinical AI needs hallucination resistance

In India and across APAC, most hospital records are still on paper. When they're digitised, clinicians need to query them quickly — during rounds, in emergencies, before prescribing. A system that invents drug allergies, misreports lab values, or fabricates diagnoses is not just useless: **it's dangerous**.

MediRAG's faithfulness threshold, dual-agent verification, and strict Groq fallback exist for one reason: the system should refuse to answer rather than guess.

---

<div align="center">

**MediRAG · Team 96 · Gen AI Academy APAC Edition · Track 2 — Model Context Protocol**

</div>
