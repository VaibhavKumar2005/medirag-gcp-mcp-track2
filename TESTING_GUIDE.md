# 🧪 MediRAG Complete Testing Guide (Local & Live)

## Quick Start: Local Testing (5 min)

### Option 1: Quick Demo Mode Test
```bash
# Start services
docker-compose up -d

# Get demo token (no login needed)
curl -X POST http://localhost:8000/api/demo/token/

# Use token in requests
TOKEN="eyJ0eXAi..." # from above
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8000/api/documents/
```

### Option 2: Full Local Stack Test
```bash
# 1. Start all services
docker-compose up -d

# Wait for services to be ready (30 sec)
sleep 30

# 2. Check health
curl http://localhost:8000/health/
curl http://localhost:8000/api/health/

# 3. Access endpoints
# Frontend:  http://localhost:5173
# Backend:   http://localhost:8000
# MCP:       http://localhost:8000/mcp  (via MCP client)
# Swagger:   http://localhost:8000/api/schema/swagger-ui/
```

---

## 📋 Full Testing Checklist

### ✅ Part 1: Backend Services (Docker)
```powershell
$services = @("rag-backend", "rag-db", "rag-redis", "rag-celery-worker")
foreach ($svc in $services) {
    $running = docker inspect -f '{{.State.Running}}' $svc 2>$null
    if ($running -eq "true") {
        Write-Host "✓ $svc running"
    } else {
        Write-Host "❌ $svc NOT running - start with: docker-compose up -d $svc"
    }
}
```

### ✅ Part 2: Health Endpoints
| Endpoint | Expected | Command |
|----------|----------|---------|
| `/health/` | `{"status": "healthy"}` | `curl http://localhost:8000/health/` |
| `/api/health/` | Full service status | `curl http://localhost:8000/api/health/` |
| `/metrics` | Prometheus metrics | `curl http://localhost:8000/metrics` |

### ✅ Part 3: Authentication & Demo Mode
```bash
# Get demo token (judges can use this)
curl -X POST http://localhost:8000/api/demo/token/ | jq

# Response:
# {
#   "access": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
#   "refresh": "...",
#   "user": {
#     "email": "demo@verirag.dev",
#     "name": "Demo User"
#   }
# }
```

### ✅ Part 4: Document Upload (Test OCR Detection)
```bash
TOKEN="<your-access-token>"

# Upload digital PDF (has text layer)
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "title=Digital Document" \
  -F "file=@digital.pdf" \
  http://localhost:8000/api/documents/ | jq

# Upload scanned PDF (OCR will be triggered)
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "title=Scanned Document" \
  -F "file=@scanned_image.pdf" \
  http://localhost:8000/api/documents/ | jq

# Response includes:
# {
#   "id": 1,
#   "title": "...",
#   "processed": false,
#   "processing_status": "queued"
# }
```

### ✅ Part 5: Watch Celery Worker Process OCR/Ingestion
```bash
# Terminal 1: Watch worker logs
docker logs -f rag-celery-worker

# Terminal 2: Upload document and watch processing
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@scanned.pdf" \
  http://localhost:8000/api/documents/

# Look for logs like:
# INFO: Document ingestion started for doc_id=1
# INFO: Attempting PyPDF extraction...
# INFO: Detected as scanned PDF - triggering Cloud Vision OCR
# INFO: OCR complete - extracted 250 chars
# INFO: Creating pgvector embeddings...
# INFO: Document processing complete
```

### ✅ Part 6: Query with Dual-Agent Verification
```bash
# Test RAG query pipeline
TOKEN="<your-token>"

curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the patient symptoms?",
    "use_fallback_model": false,
    "demo_mode": true
  }' \
  http://localhost:8000/api/query/ | jq

# Response includes:
# {
#   "query": "...",
#   "answer": "Generated answer from Gemini...",
#   "verification_passed": true,
#   "faithfulness_score": 0.87,
#   "fallback_used": false,
#   "extraction_time": 0.45,
#   "generation_time": 1.23,
#   "verification_time": 0.89
# }
```

### ✅ Part 7: MCP Server API
The MCP server exposes three main tools:

#### Tool 1: `search_documents`
```bash
# HTTP POST to MCP endpoint
curl -X POST http://localhost:8000/mcp/tools/search_documents/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "query": "patient allergies",
    "top_k": 5
  }' | jq
```

#### Tool 2: `rag_query`
```bash
curl -X POST http://localhost:8000/mcp/tools/rag_query/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the diagnosis?",
    "model": "gemini-1.5-flash"
  }' | jq
```

#### Tool 3: `get_rag_metrics`
```bash
curl -X POST http://localhost:8000/mcp/tools/get_rag_metrics/invoke | jq

# Response:
# {
#   "total_documents": 42,
#   "indexed_documents": 38,
#   "total_chunks": 1240,
#   "average_chunk_size": 512,
#   "active_model": "gemini-1.5-flash",
#   "fallback_model": "groq-llama-3.1",
#   "system_health": "operational"
# }
```

---

## 🚀 Testing on Live (Cloud Run)

### Prerequisites
```bash
# Have these set
export GCP_PROJECT_ID="your-project"
export MCP_SERVER_URL="https://your-mcp-server.run.app/mcp"
export GOOGLE_API_KEY="AIza..."
export GROQ_API_KEY="gsk_..."
```

### Deploy MCP Server
```bash
cd apps/backend
gcloud run deploy medirag-mcp-server \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="MCP_SERVER_URL=$MCP_SERVER_URL,GOOGLE_API_KEY=$GOOGLE_API_KEY,GROQ_API_KEY=$GROQ_API_KEY"
```

### Test Live Server
```bash
SERVICE_URL=$(gcloud run services describe medirag-mcp-server --region us-central1 --format 'value(status.url)')

# Health check
curl $SERVICE_URL/health | jq

# Get metrics
curl $SERVICE_URL/mcp/tools/get_rag_metrics/invoke | jq

# Query live
curl -X POST $SERVICE_URL/mcp/tools/rag_query/invoke \
  -H "Content-Type: application/json" \
  -d '{"query": "patient symptoms"}'
```

---

## 🔍 What Gets Tested?

### ✓ OCR Functionality
- **PyPDF Text Extraction** → Fast path for digital PDFs
- **Cloud Vision OCR** → Triggered for scanned/low-text documents
- **Multi-language Support** → Hindi, Telugu, Tamil, Bengali, English
- **Output**: Extracted text stored in `DocumentChunk` model with embeddings

### ✓ MCP API
- **Tool Registration** → Three tools (search, query, metrics)
- **Streaming Support** → FastMCP Streamable HTTP transport
- **Error Handling** → Graceful fallback on failures
- **Output**: JSON responses via MCP protocol

### ✓ RAG Pipeline
- **Vector Search** → Semantic search via pgvector
- **Dual-Agent Verification** → Gemini generates, Groq critiques
- **Faithfulness Scoring** → Verification confidence 0-1
- **Fallback Logic** → Switch models if primary fails

### ✓ API Security
- **JWT Authentication** → Token-based access
- **Demo Mode** → For judges (when enabled)
- **Rate Limiting** → Per-user query/upload throttles
- **HIPAA Alignment** → No data stored externally

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| **OCR not triggered** | Check avg chars < 50; verify Cloud Vision enabled |
| **MCP endpoint 404** | Ensure `/mcp` mount in FastAPI app |
| **Query hangs** | Check Celery worker: `docker logs rag-celery-worker` |
| **Vectorstore errors** | Verify pgvector extension: `SELECT * FROM pg_extension WHERE extname='vector'` |
| **Demo token 403** | Enable `DEMO_MODE=True` in Django settings |

---

## 📊 Submission Checklist
- [ ] Local testing passes (docker-compose up + tests)
- [ ] OCR tested on both digital and scanned PDFs
- [ ] MCP API responds on `/mcp` endpoint
- [ ] Dual-agent verification returning scores
- [ ] Fallback model switching works
- [ ] Rate limiting throttles requests
- [ ] Health endpoints return 200
- [ ] Demo mode works for judges
- [ ] Live deployment tested
- [ ] No hardcoded secrets in code

---

## 🎯 For Judges/Demo

**Fastest path to see it working:**

```bash
# 1. Clone & setup
cd apps/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Start services
docker-compose up -d

# 3. Get token
curl -X POST http://localhost:8000/api/demo/token/ | jq '.access' -r > /tmp/token.txt
TOKEN=$(cat /tmp/token.txt)

# 4. Upload test PDF
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  http://localhost:8000/api/documents/

# 5. Query
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is this about?"}' \
  http://localhost:8000/api/query/ | jq

# 6. Check MCP
curl http://localhost:8000/mcp/tools/get_rag_metrics/invoke | jq
```

That's it! You've tested the entire stack. ✨
