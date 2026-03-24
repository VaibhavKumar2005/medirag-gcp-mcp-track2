<div align="center">

<br />

<img src="https://img.shields.io/badge/MediRAG-Clinical%20Intelligence-22d3ee?style=for-the-badge&labelColor=040207" />
&nbsp;
<img src="https://img.shields.io/badge/Track%202-Model%20Context%20Protocol-a78bfa?style=for-the-badge&labelColor=040207" />
&nbsp;
<img src="https://img.shields.io/badge/Google%20Cloud-Cloud%20Run%20%2B%20ADK-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white&labelColor=040207" />
&nbsp;
<img src="https://img.shields.io/badge/Gemini%201.5-Flash%20%2B%20Critic%20Agent-22c55e?style=for-the-badge&labelColor=040207" />

<br /><br />

# MediRAG

**An AI agent that reads patient records and refuses to guess.**

*Gen AI Academy APAC Edition · Track 2: Model Context Protocol · Team 96*

<br />

[**Live Demo**](#-live-demo) · [**How it works**](#-how-it-works) · [**Try it yourself**](#-try-it-yourself) · [**Track 2 alignment**](#-track-2-alignment)

<br />

</div>

---

## The problem

A doctor in a district hospital in Uttar Pradesh gets a patient with chest pain. The patient is unconscious. No family. Their records were digitised six months ago across three separate PDFs — a 2019 allergy reaction report, a cardiology consultation, and last month's labs.

The doctor needs one answer: *Is this patient allergic to penicillin?*

A general-purpose AI assistant will answer confidently. Sometimes correctly. Sometimes not. It will hallucinate a dosage, invent an allergy status, or fabricate a lab result — and it will sound equally confident either way. In a general context that's an inconvenience. In this context, **it's a patient safety failure.**

**Across India, Indonesia, the Philippines, and Southeast Asia, 70–80% of hospital records are still on paper.** As digitisation accelerates — through government health programmes, hospital IT projects, emergency triage systems — clinicians urgently need AI tools that can query those records safely. Not tools that guess. Tools that know when to say *I don't know.*

---

## What MediRAG does

MediRAG is a clinical document intelligence agent built on Google Cloud. A clinician uploads patient PDFs. The agent answers questions about them in plain language. Every single answer is scored for faithfulness against the source documents before it reaches the user. If it doesn't pass the score threshold, it is **rejected and regenerated with a stricter prompt** — or the system explicitly refuses to answer.

The core innovation is not the RAG. It's the **verification gate that refuses to hallucinate.**

---

## 🔴 Live demo

| Service | URL | What it shows |
|---|---|---|
| **ADK Agent** (primary) | `https://medirag-agent-[hash]-uc.a.run.app` | Agent calling MCP tools live — open this first |
| **Frontend** | `https://verirag-frontend-[hash]-uc.a.run.app` | Full clinical dashboard with pipeline visualizer |
| **MCP Server** | `https://verirag-mcp-server-[hash]-uc.a.run.app/health` | The tool source the agent connects to |

**For judges:** Visit the ADK Agent URL → you see the ADK developer UI → type a question → watch three MCP tool calls happen → get a verified clinical answer with a faithfulness score.

No account, no setup, no API keys needed.

---

## 🧠 How it works

### The human flow

```
Doctor uploads a patient PDF
        ↓
MediRAG chunks it into 1000-character segments
and stores them as 768-dimensional vectors in PostgreSQL (pgvector)
        ↓
Doctor asks: "Is this patient allergic to penicillin?"
        ↓
        ┌─────────────────────────────────────────────────────────┐
        │              ADK Agent  (the brains)                    │
        │                                                         │
        │  Step 1 ── search_documents (MCP tool call)             │
        │    Finds which records contain penicillin information    │
        │                                                         │
        │  Step 2 ── rag_query (MCP tool call)                    │
        │    Runs the full verification pipeline (see below)      │
        │                                                         │
        │  Step 3 ── get_rag_metrics (MCP tool call)              │
        │    Confirms system health and confidence level           │
        └─────────────────────────────────────────────────────────┘
        ↓
"Yes — documented penicillin allergy. Anaphylaxis reaction in 2019.
 Avoid all beta-lactam antibiotics."
Faithfulness score: 0.94 · Source: Patient_History_2019.pdf (Page 3)
```

### The verification pipeline (inside `rag_query`)

This is what makes MediRAG different from every generic RAG system:

```
Query arrives
    ↓
STAGE 1 — Retrieve
  pgvector cosine search → top-5 most relevant chunks
  (filtered by user_id — no cross-patient data leakage)
    ↓
STAGE 2 — Generate
  Gemini 1.5 Flash, temperature 0.1, JSON mode
  Prompt: "Answer only from the context below. Do not fabricate."
  Output: answer + self-reported confidence score
    ↓
STAGE 3 — Verify (the Critic Agent)
  text-embedding-004 embeds BOTH the answer and the context
  cosine_similarity(answer_embedding, context_embedding)
  combined_score = (llm_score × 0.6) + (semantic_score × 0.4)
    ↓
STAGE 4 — Gate
  Score ≥ 0.6  →  ✅ Return answer with citations
  Score < 0.6  →  ❌ REJECT — move to fallback
    ↓
STAGE 5 — Fallback (only if rejected)
  Groq / Llama-3.3-70B, stricter prompt:
  "Quote ONLY facts directly present in the context.
   If uncertain, say you cannot answer from the available records."
  Returns regenerated answer — or explicit refusal
```

**Why semantic similarity, not word overlap?**

Word overlap catches copy-paste hallucinations. It misses paraphrased fabrications — cases where the model invents a plausible-sounding drug name, dosage, or diagnosis that uses medically appropriate vocabulary but isn't in the records. By embedding both the answer and the context with the same `text-embedding-004` model, the Critic Agent catches semantic drift, not just lexical drift.

---

## 🏗️ Architecture

Three services, all on Google Cloud Run:

```
┌─────────────────────────────────────────────────────────┐
│           React 19 Frontend  (Nginx · Cloud Run)        │
│  Clinical chat · Pipeline visualizer · Analytics        │
└─────────────────────────┬───────────────────────────────┘
                          │  HTTPS / JWT
                          ▼
┌─────────────────────────────────────────────────────────┐
│      Django REST API + MCP Server  (Cloud Run)          │
│                                                         │
│  FastMCP exposes 5 tools via Streamable HTTP:           │
│  search_documents · rag_query · list_documents          │
│  get_document_chunks · get_rag_metrics                  │
│                                                         │
│  Verification pipeline lives here (rag_logic.py):       │
│  Gemini 1.5 Flash → Critic Agent → Groq fallback        │
│                                                         │
│  PostgreSQL 16 + pgvector  (768-dim embeddings)         │
│  GCP Secret Manager  (no API keys in env vars)          │
│  Celery + Redis  (async PDF ingestion)                  │
└──────────────────────┬──────────────────────────────────┘
                       │  MCP Streamable HTTP
                       │  (spec 2025-03-26)
                       ▼
┌─────────────────────────────────────────────────────────┐
│          ADK Agent  (google-adk · Cloud Run)            │
│                                                         │
│  SequentialAgent: Researcher → Formatter                │
│  clinical_researcher  uses McpToolset (3 tools)         │
│  clinical_formatter   presents verified answer          │
│                                                         │
│  Deployed via: adk deploy cloud_run --with_ui           │
│  Judges visit the URL → ADK dev UI → live tool calls    │
└─────────────────────────────────────────────────────────┘
```

### What each piece does

**MCP Server** (`apps/backend/mcp_server.py`) is the tool source. It wraps the entire RAG + verification pipeline as MCP tools. Any MCP-compatible client — including the ADK agent — can call these tools without knowing anything about the underlying implementation.

**ADK Agent** (`verirag-adk-agent/medirag_agent/agent.py`) is the reasoning layer. It uses `SequentialAgent` with two sub-agents following the Google codelab pattern: `clinical_researcher` calls MCP tools to gather and verify data, `clinical_formatter` presents the results in a clean clinical format. The agent is deployed with `adk deploy cloud_run --with_ui` so the ADK developer UI is accessible at the Cloud Run URL.

**Frontend** (`apps/frontend/`) is the clinical dashboard. It shows the verification pipeline animating in real time as each query runs — five stages with a live progress line, a cosine similarity meter counting up to the actual score, and RAGAS sub-scores appearing when the result arrives. There is also an ADK Agent tab that shows the three-step MCP reasoning chain live.

---

## ✅ Track 2 alignment

The submission requirement: *"Build one AI agent that uses MCP to connect to one tool, retrieves structured data, and uses that data in its response."*

| Requirement | Implementation | File |
|---|---|---|
| **AI agent using ADK** | `SequentialAgent` with `clinical_researcher` + `clinical_formatter` sub-agents | `verirag-adk-agent/medirag_agent/agent.py` |
| **Uses MCP to connect to a tool** | `McpToolset` with `StreamableHTTPConnectionParams` pointing at the MCP Server | `agent.py` line 47 |
| **Retrieves structured data** | `rag_query` returns JSON: `{answer, faithfulness_score, evidence_items, evaluation}` | `mcp_server.py` |
| **Uses retrieved data in response** | `clinical_formatter` reads `research_findings` from shared state and formats the final answer | `agent.py` line 96 |
| **Deployed to Cloud Run** | `adk deploy cloud_run medirag_agent --with_ui` | See deploy instructions below |

---

## 🚀 Try it yourself

### Option 1 — ADK dev UI (what judges should use)

```
1. Visit the ADK Agent Cloud Run URL
2. You see the ADK developer UI
3. Enable Token Streaming (top right)
4. Type: "What allergies does the patient have?"
5. Watch three MCP tool calls execute in the UI
6. See the verified answer with faithfulness score
```

### Option 2 — Frontend clinical dashboard

```
1. Visit the frontend URL
2. Click "Try Demo — No account needed"  (one click, no signup)
3. Three patient scenarios are pre-loaded:
   - Acute chest pain with penicillin allergy
   - Post-CABG discharge summary  
   - Comprehensive metabolic panel
4. Ask any clinical question
5. Watch the 5-stage pipeline animate live
```

### Option 3 — API directly

```bash
# The ADK agent API (following codelab pattern)
SERVICE_URL=https://medirag-agent-[hash]-uc.a.run.app

# Create a session
curl -X POST $SERVICE_URL/apps/medirag_clinical_agent/users/u1/sessions \
  -H "Content-Type: application/json" -d '{}'

# Run the agent
curl -X POST $SERVICE_URL/run \
  -H "Content-Type: application/json" \
  -d '{
    "app_name": "medirag_clinical_agent",
    "user_id": "u1",
    "session_id": "s1",
    "new_message": {
      "role": "user",
      "parts": [{"text": "What allergies does the patient have?"}]
    }
  }'
```

---

## 📁 Project structure

```
verirag-gcp-mcp-track2/
│
├── verirag-adk-agent/              ← PRIMARY SUBMISSION — ADK agent
│   └── medirag_agent/
│       ├── agent.py                ← root_agent (SequentialAgent)
│       ├── __init__.py             ← from . import agent
│       └── requirements.txt        ← google-adk, httpx
│
├── apps/
│   ├── backend/                    ← Django REST API + MCP Server
│   │   ├── mcp_server.py           ← FastMCP, 5 tools, Streamable HTTP
│   │   ├── ai_engine/
│   │   │   ├── rag_logic.py        ← Verification pipeline (core logic)
│   │   │   ├── views.py            ← REST endpoints + demo mode
│   │   │   ├── models.py           ← Document model (multi-tenant)
│   │   │   └── tasks.py            ← Celery PDF ingestion
│   │   ├── Dockerfile.mcp          ← MCP Server container
│   │   └── requirements.txt        ← All security-patched deps
│   │
│   └── frontend/                   ← React 19 clinical dashboard
│       └── src/
│           ├── Dashboard.jsx        ← Chat + pipeline visualizer + ADK tab
│           ├── PipelineVisualizer.jsx ← Live 5-stage animation
│           ├── ADKAgentPanel.jsx    ← Live MCP tool call viewer
│           └── LandingPage.jsx      ← Public landing page
│
├── docs/
│   ├── README.md                   ← Full technical documentation
│   └── ARCHITECTURE.md             ← Deep-dive: pipeline, failure modes
│
├── ops/
│   └── monitoring/                 ← Grafana dashboards + alert rules
│
├── docker-compose.yml              ← Local development (all services)
├── .env.example                    ← Environment template
└── SUBMISSION.md                   ← Judging guide with demo scenarios
```

---

## 🛠️ Tech stack

| Layer | Technology | Why this choice |
|---|---|---|
| **AI Agent** | google-adk `SequentialAgent` | Codelab pattern: Researcher → Formatter separation of concerns |
| **MCP transport** | FastMCP Streamable HTTP | MCP spec 2025-03-26 — standard, not custom protocol |
| **Primary LLM** | Gemini 1.5 Flash | JSON mode + safety settings + temperature 0.1 for clinical accuracy |
| **Embeddings** | `text-embedding-004` | Same model for ingestion AND verification — ensures semantic alignment |
| **Fallback LLM** | Groq / Llama-3.3-70B | Different architecture from Gemini — reduces correlated hallucination risk |
| **Vector DB** | PostgreSQL 16 + pgvector | No separate vector service needed; single database; user-level filtering |
| **Backend** | Django 5.1.9 + DRF | Battle-tested; HIPAA-friendly audit logging; multi-tenant from day one |
| **Task queue** | Celery + Redis | Async PDF ingestion — upload returns instantly, indexing happens in background |
| **Secrets** | GCP Secret Manager | No API keys in container images, env vars, or Git history |
| **Observability** | Prometheus + Grafana | Tracks hallucination rejection rate — the metric that matters clinically |
| **Infrastructure** | Cloud Run (all services) | Serverless; scales to zero; no cluster management |

---

## 💻 Run locally

### Prerequisites

- Docker Desktop
- `GOOGLE_API_KEY` from [Google AI Studio](https://aistudio.google.com/app/apikey)
- `GROQ_API_KEY` from [Groq Console](https://console.groq.com/) *(optional — for fallback)*

### Start everything

```bash
git clone https://github.com/VaibhavKumar2005/verirag-gcp-mcp-track2.git
cd verirag-gcp-mcp-track2

cp .env.example .env
# Set GOOGLE_API_KEY and DJANGO_SECRET_KEY in .env

docker compose up --build
```

| Service | Local URL |
|---|---|
| Frontend | http://localhost:5173 |
| Django API + MCP | http://localhost:8000 |
| Grafana | http://localhost:3000 |
| Prometheus | http://localhost:9090 |

### Demo mode (no signup needed)

```bash
# Get a demo JWT
curl http://localhost:8000/api/demo/token/

# Pre-load 3 clinical patient scenarios
curl -X POST http://localhost:8000/api/demo/seed/ \
  -H "Authorization: Bearer <token>"
```

### Run the ADK agent locally

```bash
cd verirag-adk-agent
pip install google-adk

# Point it at your local MCP server
MCP_SERVER_URL=http://localhost:8000/mcp adk web medirag_agent
```

Visit http://localhost:8000 — you get the full ADK dev UI running against the local MCP server.

---

## ☁️ Deploy to Cloud Run

```bash
# 1. Deploy the MCP Server first
gcloud run deploy medirag-mcp-server \
  --source ./apps/backend \
  --dockerfile Dockerfile.mcp \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8000 \
  --set-env-vars="GOOGLE_API_KEY=your-key,GCP_PROJECT_ID=your-project"

# 2. Deploy the ADK Agent pointing at the MCP server
cd verirag-adk-agent
adk deploy cloud_run medirag_agent \
  --project=your-project \
  --region=us-central1 \
  --with_ui \
  --set-env-vars="MCP_SERVER_URL=https://medirag-mcp-server-HASH-uc.a.run.app/mcp" \
  --set-secrets="GOOGLE_API_KEY=google-api-key:latest" \
  -- --allow-unauthenticated

# 3. Deploy the Frontend (optional)
gcloud run deploy medirag-frontend \
  --source ./apps/frontend \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

The ADK Agent Cloud Run URL is the primary submission URL. Judges visit it and interact with the agent directly in the ADK developer UI.

---

## 🏥 HIPAA alignment

MediRAG does not claim HIPAA certification, but is designed with its controls in mind:

| Control (HIPAA §) | Implementation |
|---|---|
| **Minimum necessary access** (§164.312) | `tool_filter` in McpToolset limits agent to 3 read-only tools |
| **Audit controls** (§164.312(b)) | Every MCP call logged in Cloud Logging with request IDs |
| **Transmission security** (§164.312(e)) | Cloud Run enforces HTTPS; no plaintext transport |
| **No PHI in logs** (§164.308) | `_safe_log()` strips control characters and truncates before any log statement |
| **Multi-tenant isolation** | Every pgvector query filtered by `user_id` — no cross-patient data |
| **Session isolation** | ADK session IDs separate each user's conversation context |
| **Secrets management** | GCP Secret Manager — no credentials in images, env vars, or Git |

---

## 📊 Observability

Prometheus metrics exposed at `/metrics` (scraped by Grafana):

| Metric | What it measures |
|---|---|
| `verirag_hallucination_rejections_total` | How many times the Critic Agent rejected an answer |
| `verirag_llm_fallbacks_total` | How many times Groq regenerated after Gemini was rejected |
| `verirag_faithfulness_score` | Histogram of all combined faithfulness scores |
| `verirag_queries_total` | Total clinical queries processed |
| `verirag_documents_ingested_total` | PDFs successfully vectorized |
| `verirag_active_model` | Which LLM is currently serving (1=Gemini, 2=Groq) |

The hallucination rejection rate is the number that matters clinically. It tells you how often the system caught itself before giving a wrong answer.

---

## 🌏 Why this matters for APAC

India's Ayushman Bharat Digital Mission is digitising hundreds of millions of health records. Indonesia's national health system (BPJS) serves 250 million people. The Philippines, Vietnam, and Thailand are all running similar digitisation programmes.

Every digitisation project creates the same immediate need: clinicians need to query those records in real time, in emergencies, in resource-constrained environments where there is no time to manually search through PDF documents.

The failure mode of hallucinating AI is not hypothetical in this context. It is the default behaviour of every general-purpose LLM deployed on clinical data without a verification layer. MediRAG is built specifically to prevent that failure — not as a feature, but as the architectural foundation.

---

<div align="center">

**MediRAG · Team 96 · Gen AI Academy APAC Edition · Track 2 — Model Context Protocol**

*Clinical intelligence that refuses to guess.*

</div>
