# MediRAG Submission Guide

**Team 96**
**Track 2: Model Context Protocol**

---

## One-Line Summary

MediRAG is a clinical document intelligence system that uses MCP-connected tools and a verification gate to answer questions from patient PDFs without guessing.

---

## Track 2 Mapping

| Requirement | MediRAG Implementation |
|---|---|
| AI agent uses MCP | Google ADK agent in `verirag-adk-agent/` uses `McpToolset` |
| Connects to at least one tool | The agent calls the backend FastMCP server over Streamable HTTP |
| Retrieves structured data | Tools return JSON-like structured results including evidence and faithfulness metrics |
| Uses that data in the response | The ADK agent formats verified findings into the final user-facing answer |

---

## What Makes The Project Different

- OCR support for scanned documents, not just text PDFs
- Verified RAG flow with a faithfulness score
- Fallback path when the first answer is not grounded enough
- MCP exposed cleanly as a reusable tool boundary
- A real demo surface through the ADK agent and frontend

---

## Core Demo Story

1. Upload a patient PDF.
2. Ask a clinical question.
3. Watch the system retrieve evidence.
4. See the answer returned with verification metadata.
5. If confidence is poor, watch the fallback or refusal behavior.

---

## Important Files

- `verirag-adk-agent/medirag_agent/agent.py`: ADK agent
- `apps/backend/mcp_server.py`: FastMCP server
- `apps/backend/ai_engine/rag_logic.py`: verification pipeline
- `apps/backend/ai_engine/views.py`: API endpoints
- `apps/frontend/src/Dashboard.jsx`: frontend experience

---

## Recommended Demo Order

### 1. ADK agent
- Best for showing the MCP requirement directly
- Show live tool invocation and final verified response

### 2. Frontend dashboard
- Best for showing the broader product experience
- Demonstrates upload, retrieval, verification, and metrics in one place

### 3. MCP endpoint
- Best for technical reviewers who want to inspect the tool layer directly

---

## Before Submission

- Run the checks in `TESTING_GUIDE.md`
- Review `SUBMISSION_READY.md`
- Confirm secrets are not staged
- Make sure the main docs match the current branch state

---

## Repository

- Repo: `https://github.com/VaibhavKumar2005/verirag-gcp-mcp-track2`
- Working branch: `track-2-mcp-submission`
