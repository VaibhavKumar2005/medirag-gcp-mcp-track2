# MediRAG GCP Simplification Strategy

This guide explains how to keep the Google Cloud deployment realistic without over-building the first release.

---

## Level 1: Demo-Friendly Deployment

Use this when the goal is a clean submission or stakeholder demo.

- One Cloud Run service for the backend API and MCP server
- Separate frontend deployment only if the UI is part of the demo
- Managed PostgreSQL instance with `pgvector`
- Redis only if background ingestion is required for the demo
- Focus on a stable `rag_query` flow, upload path, and metrics endpoint

### Keep
- MCP tool boundary
- Verified RAG flow
- At least one realistic document upload/query scenario

### Defer
- Heavy observability polish
- Nonessential dashboards
- Aggressive autoscaling or advanced networking

---

## Level 2: Submission-Ready Cloud Setup

Use this when judges or reviewers may inspect architecture depth.

- Backend and ADK agent deployed as separate Cloud Run services
- Frontend deployed independently
- PostgreSQL, Redis, and secret management configured properly
- Logging and health checks enabled for each service
- Documented demo URLs and testing steps

---

## Level 3: Hardened Production Direction

Use this when the system is moving beyond a hackathon/demo context.

- Separate deployment pipelines for frontend, backend, and agent
- Stronger secret rotation and IAM controls
- Observability for ingestion, retrieval, and verification latency
- Clear SLOs around upload completion and query quality
- Safer rollout controls for model or threshold changes

---

## Recommendation

For this repository, the best default is Level 2:

- It keeps the MCP architecture visible.
- It matches the Track 2 story well.
- It is still small enough to operate without unnecessary platform work.

---

## Practical Cost And Complexity Advice

- Do not optimize for a perfect production topology before the demo works.
- Keep services stateless and configuration-driven.
- Validate OCR, retrieval, and fallback behavior in the deployed environment, not only locally.
- Treat documentation as part of the deliverable because the deployment story is a judged surface too.
