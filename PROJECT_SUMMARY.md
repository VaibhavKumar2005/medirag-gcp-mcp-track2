# MediRAG Project Summary

**Last Updated:** March 30, 2026
**Status:** Active implementation and submission hardening
**Primary Target:** Google Cloud Run

---

## What The Project Is

MediRAG is a document intelligence system for clinical PDFs. It helps users upload records, retrieve grounded evidence, and ask questions through a verified RAG pipeline. The system is built to reduce hallucination risk by checking answer faithfulness before returning a result.

---

## Product Goals

- Answer questions from patient documents with evidence-backed responses
- Support both digital PDFs and scanned/image-heavy records
- Expose the retrieval and reasoning flow through MCP-compatible tools
- Provide a demoable end-to-end experience for Track 2 judging

---

## Architecture At A Glance

- `apps/backend/`: Django API, ingestion, embeddings, verification logic, FastMCP server
- `apps/frontend/`: React dashboard and demo experience
- `verirag-adk-agent/`: ADK agent that calls MCP tools from the backend
- Infrastructure: Cloud Run, PostgreSQL, Redis, and Google AI services

---

## Why The Current Architecture Works

- The backend owns the data, retrieval, and verification pipeline.
- MCP provides a clean tool interface instead of tightly coupling the agent to backend internals.
- The ADK agent becomes a thin reasoning layer that can call tools, assemble results, and present them clearly.
- The frontend offers a user-facing workflow while the same backend remains reusable for agents and API consumers.

---

## Key Capabilities

- Document upload and ingestion
- OCR-assisted extraction for scanned PDFs
- Vector search over chunked document content
- Verified question answering with confidence/fallback logic
- MCP tool access for agentic workflows
- Demo-friendly authentication path and health/metrics endpoints

---

## Primary Risks To Manage

- Documentation drift between old design notes and the current implementation
- Deployment complexity across multiple services
- Secrets handling during demo and submission preparation
- Incomplete validation if OCR, embeddings, or worker flows are not tested together

---

## Recommended Immediate Priorities

1. Keep the top-level docs aligned with the codebase and submission story.
2. Validate the full local flow with `TESTING_GUIDE.md`.
3. Stage and push documentation changes separately from unrelated application edits.
