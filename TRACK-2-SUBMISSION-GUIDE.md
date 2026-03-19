# VeriRAG GCP MCP Track 2 Submission Guide

## 📊 Project Overview

**VeriRAG: Enterprise Document Intelligence with Model Context Protocol**

VeriRAG is a production-grade Retrieval-Augmented Generation (RAG) system demonstrating secure tool-agent integration using Model Context Protocol (MCP) on Google Cloud.

---

## ✅ Track 2 Requirements Checklist

This submission meets ALL Track 2 requirements:

- ✅ **AI Agent**: ADK-based agent using Gemini 3.1 Pro model
- ✅ **MCP Integration**: VeriRAG backend exposes tools via FastMCP
- ✅ **Data Retrieval**: Semantic search across document corpus
- ✅ **Contextual Response**: RAG inference using retrieved documents
- ✅ **Cloud Deployment**: Both services deployed to Google Cloud Run

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────┐
│ GOOGLE CLOUD RUN (ADK Agent)               │
├─────────────────────────────────────────────┤
│                                             │
│ verirag-adk-agent                          │
│ ├─ Gemini 3.1 Pro LLM                      │
│ ├─ McpToolset connection                   │
│ ├─ FastAPI interface                       │
│ └─ /query, /chat, /health endpoints        │
│                                             │
└──────────────────┬──────────────────────────┘
                   │ MCP Protocol (HTTPS)
                   ↓
┌─────────────────────────────────────────────┐
│ GOOGLE CLOUD RUN (MCP Server)              │
├─────────────────────────────────────────────┤
│                                             │
│ verirag-mcp-server                         │
│ ├─ FastMCP framework                       │
│ ├─ search_documents tool                   │
│ ├─ rag_query tool                          │
│ ├─ list_documents tool                     │
│ ├─ get_document_chunks tool                │
│ └─ get_rag_metrics tool                    │
│                                             │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│ GCP DATA STORAGE                            │
├─────────────────────────────────────────────┤
│ ├─ PostgreSQL (documents, embeddings)      │
│ ├─ Google Cloud Storage (files)            │
│ └─ Firestore (metadata, cache)             │
└─────────────────────────────────────────────┘
```

---

## 🚀 12-Day Implementation Timeline

### Days 1-2: Repository Setup
```bash
# Clone the repository
git clone https://github.com/VaibhavKumar2005/verirag-gcp-mcp-track2
cd verirag-gcp-mcp-track2

# Create feature branch
git checkout -b track-2-mcp-submission

# Update Python dependencies
pip install -r requirements-gcp-track2.txt
```

**Tasks:**
- [ ] Clone repository
- [ ] Create new branch
- [ ] Install GCP dependencies
- [ ] Update `.env` for GCP

### Days 3-4: MCP Server Implementation
```bash
# Copy MCP server to backend
cp outputs/mcp_server.py apps/backend/

# Update settings
python apps/backend/manage.py migrate
```

**Tasks:**
- [ ] Implement FastMCP server (`apps/backend/mcp_server.py`)
- [ ] Define MCP tools (search, rag_query, list_documents, etc.)
- [ ] Test locally with: `python apps/backend/mcp_server.py`
- [ ] Verify tool discovery

### Days 5-6: ADK Agent Implementation
```bash
# Create ADK agent directory
mkdir verirag-adk-agent

# Copy agent code
cp outputs/verirag_adk_agent.py verirag-adk-agent/

# Test locally
cd verirag-adk-agent
python verirag_adk_agent.py
```

**Tasks:**
- [ ] Implement ADK agent (`verirag-adk-agent/main.py` or `verirag_adk_agent.py`)
- [ ] Configure McpToolset connection
- [ ] Test agent locally against MCP server
- [ ] Create requirements.txt for agent

### Days 7-8: Cloud Run Deployment
```bash
# Setup GCP project
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default login

# Create GitHub secrets
# - GCP_PROJECT_ID
# - GOOGLE_CLOUD_SA_JSON

# Copy deployment workflow
cp outputs/deploy-gcp-track2.yml .github/workflows/

# Push changes
git add .
git commit -m "feat: Add Track 2 MCP implementation"
git push origin track-2-mcp-submission
```

**Tasks:**
- [ ] Create GCP project
- [ ] Create service account with Cloud Run role
- [ ] Add GitHub secrets
- [ ] Push code to trigger deployment
- [ ] Verify both services deployed successfully

### Days 9-10: Testing & Documentation
```bash
# Test MCP server
curl https://verirag-mcp-server-XXXXX.a.run.app/health

# Test ADK agent
curl -X POST https://verirag-adk-agent-XXXXX.a.run.app/query \
  -H "Content-Type: application/json" \
  -d '{"message": "List all documents"}'
```

**Tasks:**
- [ ] End-to-end testing
- [ ] Document API endpoints
- [ ] Create TRACK-2-SUBMISSION.md
- [ ] Record demo video (optional but recommended)

### Days 11-12: Final Submission
```bash
# Final checks
- Verify both Cloud Run services are running
- Test all MCP tools
- Verify agent responds correctly
- Double-check documentation
- Prepare presentation

# Submit to Hack2skill platform
```

---

## 🔧 Setup Instructions

### 1. GCP Project Configuration

```bash
# Create new GCP project
gcloud projects create verirag-track2

# Set project
gcloud config set project verirag-track2

# Enable required APIs
gcloud services enable \
  cloudrun.googleapis.com \
  containerregistry.googleapis.com \
  aiplatform.googleapis.com \
  cloudsql.googleapis.com
```

### 2. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create verirag-github-sa \
  --display-name="VeriRAG GitHub Actions"

# Grant Cloud Run Admin role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:verirag-github-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Create key
gcloud iam service-accounts keys create key.json \
  --iam-account=verirag-github-sa@PROJECT_ID.iam.gserviceaccount.com
```

### 3. Add GitHub Secrets

In your GitHub repository:
1. Go to **Settings → Secrets and variables → Actions**
2. Add secrets:
   - `GCP_PROJECT_ID`: Your GCP project ID
   - `GOOGLE_CLOUD_SA_JSON`: Contents of `key.json`

### 4. Deploy Services

```bash
# Push to track-2-mcp-submission branch
git push origin track-2-mcp-submission

# GitHub Actions automatically deploys both services
# Monitor in Actions tab
```

---

## 📝 MCP Tools Reference

### search_documents
```python
{
  "query": "machine learning",
  "top_k": 5
}
```

Returns: List of documents ranked by relevance

### rag_query
```python
{
  "question": "What is machine learning?",
  "use_context": True
}
```

Returns: Answer generated using retrieved context

### list_documents
```python
{}
```

Returns: All available documents with metadata

### get_document_chunks
```python
{
  "doc_id": "123",
  "limit": 10
}
```

Returns: Text chunks from specific document

### get_rag_metrics
```python
{}
```

Returns: System metrics and statistics

---

## 🧪 Testing the Deployment

### Health Check
```bash
# MCP Server health
curl https://verirag-mcp-server-XXXXX.a.run.app/health

# ADK Agent health
curl https://verirag-adk-agent-XXXXX.a.run.app/health
```

### Query Tests
```bash
# List documents
curl -X POST https://verirag-adk-agent-XXXXX.a.run.app/query \
  -H "Content-Type: application/json" \
  -d '{"message": "What documents do we have?"}'

# Search for information
curl -X POST https://verirag-adk-agent-XXXXX.a.run.app/query \
  -H "Content-Type: application/json" \
  -d '{"message": "Search for information about machine learning"}'

# Ask a question
curl -X POST https://verirag-adk-agent-XXXXX.a.run.app/query \
  -H "Content-Type: application/json" \
  -d '{"message": "Can you summarize the key concepts?"}'
```

### Local Testing
```bash
# Start MCP server locally
cd apps/backend
python mcp_server.py

# In another terminal, start ADK agent
cd verirag-adk-agent
python verirag_adk_agent.py serve

# Test via curl
curl -X POST http://localhost:8080/query \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

---

## 📋 Track 2 Submission Checklist

- [ ] Repository cloned to new GCP-focused repo
- [ ] MCP server implemented (FastMCP)
- [ ] ADK agent implemented (Gemini 3.1 Pro)
- [ ] Both services deployed to Cloud Run
- [ ] GitHub Actions workflow configured
- [ ] Tests passing (health checks, tool calls)
- [ ] Documentation complete
- [ ] Demo video recorded (optional)
- [ ] Ready for submission

---

## 🎯 Portfolio Talking Points

When presenting this project:

1. **Architecture**: "I built a multi-service architecture with separation of concerns - the MCP server handles data access and tools, while the ADK agent handles reasoning and user interaction."

2. **Tool Integration**: "I implemented the Model Context Protocol to provide secure, standardized tool access - the agent can discover and call tools without direct database access."

3. **RAG Implementation**: "I combined retrieval-augmented generation with semantic search to provide accurate, context-grounded answers from documents."

4. **Cloud Deployment**: "Both services are containerized and deployed to Google Cloud Run with auto-scaling, demonstrating production-ready cloud-native practices."

5. **LLM Integration**: "I integrated Google's Gemini 3.1 Pro model for reasoning and response generation, showcasing modern LLM capabilities."

---

## 🔗 Useful Links

- [ADK Agents Codelabs](https://codelabs.developers.google.com/)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Google Cloud Run](https://cloud.google.com/run/docs)
- [Hack2skill Dashboard](https://hack2skill.com/)

---

## 📞 Troubleshooting

### Issue: MCP Server not responding
```bash
# Check logs
gcloud run logs read verirag-mcp-server

# Test locally first
cd apps/backend
python mcp_server.py
```

### Issue: Agent can't connect to MCP server
```bash
# Verify URL in Cloud Run environment variable
gcloud run services describe verirag-adk-agent --format yaml

# Check MCP_SERVER_URL is set correctly
```

### Issue: Deployment fails
```bash
# Check service account permissions
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:verirag-github-sa*"

# Verify Docker image builds locally
docker build -t verirag-mcp-server apps/backend/
```

---

## ✨ Next Steps After Submission

After submitting Track 2:

1. **Extend to BigQuery**: Migrate document storage to BigQuery for scalability
2. **Add Authentication**: Implement OAuth for production use
3. **Multi-turn Chat**: Extend to support conversation history
4. **Document Analysis**: Add tools for document classification, summarization
5. **Cost Optimization**: Implement caching and batch processing
6. **Monitoring**: Add comprehensive logging and metrics

---

**Good luck with your submission! You've got this! 🚀**

