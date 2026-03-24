# MediRAG ADK Agent

**Track 2 — Model Context Protocol | Gen AI Academy APAC Edition**

This is the ADK agent component of MediRAG. It follows the pattern from the official Google codelab: a `SequentialAgent` with two sub-agents (Researcher → Formatter) that connects to the MediRAG MCP server via `MCPToolset`.

---

## How it works

```
User question (via ADK Web UI or API)
          ↓
clinical_researcher (LlmAgent)
  ├── search_documents  — finds relevant patient records
  ├── rag_query         — runs full dual-agent verification pipeline
  └── get_rag_metrics   — appends system confidence snapshot
          ↓
  findings saved to shared state (output_key="research_findings")
          ↓
clinical_formatter (LlmAgent)
  └── reads research_findings → formats as structured clinical response
          ↓
Verified answer with faithfulness score, source citations, confidence level
```

The agent only has access to three MCP tools (`tool_filter`) — no write tools, no user management, minimum necessary access.

---

## Project structure

```
verirag-adk-agent/
├── medirag_agent/        ← ADK Python package
│   ├── agent.py          ← root_agent defined here
│   ├── __init__.py       ← from . import agent
│   └── requirements.txt  ← minimal deps for adk deploy
└── README.md
```

---

## Deployment

### Prerequisites

```bash
pip install google-adk
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Set environment variables

```bash
export GCP_PROJECT_ID=project-5f9ff1f2-755e-4532-bcd
export GCP_REGION=us-central1
export MCP_SERVER_URL=https://verirag-mcp-server-HASH-uc.a.run.app/mcp
export GOOGLE_API_KEY=AIza...your-key
```

### Deploy with `adk deploy cloud_run` (recommended)

```bash
cd verirag-adk-agent

adk deploy cloud_run medirag_agent \
  --project=$GCP_PROJECT_ID \
  --region=$GCP_REGION \
  --with_ui \
  --set-env-vars="MCP_SERVER_URL=$MCP_SERVER_URL,GOOGLE_API_KEY=$GOOGLE_API_KEY"
```

The `--with_ui` flag deploys the ADK developer UI alongside the agent API. Visit the Cloud Run URL to interact with the agent directly in the browser.

### Or use gcloud directly

```bash
adk deploy cloud_run medirag_agent \
  --project=$GCP_PROJECT_ID \
  --region=$GCP_REGION \
  --with_ui \
  --set-env-vars="MCP_SERVER_URL=$MCP_SERVER_URL" \
  --set-secrets="GOOGLE_API_KEY=google-api-key:latest"
```

---

## Test the deployed agent

After deployment, visit the Cloud Run URL in a browser. You'll see the ADK dev UI.

Toggle **Token Streaming** in the top right, then try:

```
What allergies does the patient have?
```

You should see the agent call three MCP tools in sequence and return a verified answer with faithfulness score.

### Via API

```bash
SERVICE_URL=https://medirag-agent-HASH-uc.a.run.app

# Create a session
curl -X POST $SERVICE_URL/apps/medirag_clinical_agent/users/demo/sessions \
  -H "Content-Type: application/json" -d '{}'

# Run the agent
curl -X POST $SERVICE_URL/run \
  -H "Content-Type: application/json" \
  -d '{
    "app_name": "medirag_clinical_agent",
    "user_id": "demo",
    "session_id": "SESSION_ID",
    "new_message": {
      "role": "user",
      "parts": [{"text": "What medications is the patient taking?"}]
    }
  }'
```

---

## HIPAA alignment

| Control | Implementation |
|---|---|
| Minimum necessary access (§164.312) | `tool_filter` limits agent to 3 read-only MCP tools |
| Audit controls (§164.312(b)) | All MCP calls logged in Cloud Logging with request IDs |
| Transmission security (§164.312(e)) | Cloud Run enforces HTTPS; no plaintext transport |
| No cross-boundary PHI transfer | MCP server in same GCP project; no external API calls with patient data |
| Log sanitisation | `_safe_log()` strips CR/LF and truncates before any logging |
| Session isolation | ADK session IDs separate each user's conversation context |

---

## MCP tools used

| Tool | What it does |
|---|---|
| `search_documents` | Semantic similarity search via pgvector — finds relevant records |
| `rag_query` | Full dual-agent pipeline: retrieve → Gemini generates → Critic scores → optional Groq fallback |
| `get_rag_metrics` | Live system health: record counts, model, faithfulness threshold |
