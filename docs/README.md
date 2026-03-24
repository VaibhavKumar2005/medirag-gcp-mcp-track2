# MediRAG — Technical Documentation

**Track 2 · Model Context Protocol · Gen AI Academy APAC Edition · Team 96**

---

## Navigation

| Document | Contents |
|---|---|
| [`/README.md`](../README.md) | Project overview, human problem, how it works, local dev, deployment |
| [`/SUBMISSION.md`](../SUBMISSION.md) | Judge-facing guide: demo instructions, track requirement checklist |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Deep-dive: pipeline stages, code-level detail, failure modes |
| [`verirag-adk-agent/README.md`](../verirag-adk-agent/README.md) | ADK agent: deployment, HIPAA controls, API testing |
| [`/OIDC_SETUP_COMPLETE.md`](../OIDC_SETUP_COMPLETE.md) | GCP Workload Identity Federation setup |

---

## What the project does

A clinician uploads patient PDFs. An AI agent answers clinical questions about them. Every answer is scored for faithfulness against the source documents — answers that don't pass are rejected and regenerated, or the system explicitly refuses to answer.

The MCP layer is the separation of concerns the track requires: the ADK agent handles reasoning, the MCP server handles tool execution and data access. Neither knows the internal implementation of the other.

---

## The three services

### MCP Server

`apps/backend/mcp_server.py` — FastMCP, Cloud Run, port 8000.

Five tools via Streamable HTTP (MCP spec 2025-03-26):

| Tool | What it does |
|---|---|
| `search_documents` | Cosine similarity search in pgvector — returns ranked chunks |
| `rag_query` | Full 5-stage verification pipeline — returns answer + faithfulness score |
| `list_documents` | All indexed records with chunk counts |
| `get_document_chunks` | Raw text segments from a specific document |
| `get_rag_metrics` | Live system health: record counts, active model, threshold |

Health endpoint: `GET /health`

### ADK Agent

`verirag-adk-agent/medirag_agent/agent.py` — google-adk, Cloud Run.

`SequentialAgent` with two sub-agents:

```
clinical_researcher  (LlmAgent)
  McpToolset → search_documents, rag_query, get_rag_metrics
  output_key: "research_findings"
      ↓
clinical_formatter  (LlmAgent)
  reads {research_findings} from shared state
  formats verified clinical response
```

Deployed: `adk deploy cloud_run medirag_agent --with_ui`

The `--with_ui` flag serves the ADK developer UI at the Cloud Run URL — judges interact with the agent directly in the browser.

### Frontend

`apps/frontend/src/` — React 19, Vite 7, Cloud Run.

Key components:
- `PipelineVisualizer.jsx` — 5-stage animation with live cosine similarity meter
- `ADKAgentPanel.jsx` — MCP tool call viewer, 3-step chain
- `Dashboard.jsx` — clinical chat, upload, analytics

---

## Verification pipeline

Defined in `apps/backend/ai_engine/rag_logic.py` → `get_verified_answer()`:

```
Query
  ↓ pgvector similarity_search (k=5, filtered by user_id)
Retrieve top-5 chunks
  ↓ Gemini 1.5 Flash (JSON mode, temp=0.1)
Primary answer + self-reported score
  ↓ text-embedding-004 embeds answer AND context
Cosine similarity computed
  combined = llm_score × 0.6 + semantic × 0.4
  ↓
Score ≥ 0.6  →  return answer with citations
Score < 0.6  →  reject → Groq/Llama-3 strict prompt
                       → or explicit refusal
```

---

## Environment variables

```env
DJANGO_SECRET_KEY=           # Required
GOOGLE_API_KEY=              # Required
GCP_PROJECT_ID=              # Required in cloud mode

POSTGRES_HOST=rag-db
POSTGRES_DB=medirag_db
POSTGRES_USER=admin
POSTGRES_PASSWORD=

GROQ_API_KEY=                # Optional — enables Llama-3 fallback
GEMINI_MODEL=gemini-1.5-flash
DEMO_MODE=True
REDIS_URL=redis://rag-redis:6379/0
MCP_SERVER_URL=              # ADK agent only — set to MCP Server URL
```

---

*MediRAG · Team 96 · Gen AI Academy APAC · Track 2*
