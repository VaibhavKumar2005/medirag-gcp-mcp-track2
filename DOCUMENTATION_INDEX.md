# MediRAG Documentation Index

**Last Updated:** March 30, 2026
**Primary Project:** Clinical document intelligence system with MCP, ADK, and verified RAG

---

## Start Here

### `README.md`
- Best first read for anyone landing in the repository
- Covers project purpose, architecture, local setup, and key links
- Use this when you need a quick but accurate picture of the current codebase

### `SUBMISSION.md`
- Judge-facing summary for the Gen AI Academy APAC Track 2 submission
- Explains the MCP requirement mapping, demo flow, and deployment story
- Use this when preparing a submission or demo walkthrough

### `SUBMISSION_READY.md`
- Practical pre-push and pre-submission checklist
- Focused on readiness checks, testing flow, and packaging hygiene
- Use this right before a release, branch handoff, or competition submission

---

## Implementation Guides

### `PROJECT_SUMMARY.md`
- High-level product and architecture summary for the current MediRAG build
- Good for onboarding teammates, reviewers, and stakeholders

### `ARCHITECTURE_REFERENCE.md`
- Quick visual reference for services, data flow, and failure boundaries
- Best when you want the system shape without reading the full design narrative

### `QUICK_IMPLEMENTATION_GUIDE.md`
- Developer-oriented setup and extension guide
- Covers local development, backend/frontend flow, and common implementation tasks

### `GCP_SIMPLIFICATION_STRATEGY.md`
- Practical deployment-scope guide for Google Cloud
- Explains what to keep for a demo build, what to harden for production, and how to scale gradually

---

## Deep Reference

### `MULTI_AGENT_PRODUCTIVITY_DESIGN.md`
- Legacy concept/design exploration kept for reference
- Useful for reusable multi-agent orchestration ideas, not as the source of truth for the current product narrative

### `TESTING_GUIDE.md`
- End-to-end local and cloud testing guide
- Use when validating OCR, ingestion, query flow, MCP endpoints, and demo mode

---

## Recommended Reading Order

1. `README.md`
2. `PROJECT_SUMMARY.md`
3. `ARCHITECTURE_REFERENCE.md`
4. `QUICK_IMPLEMENTATION_GUIDE.md`
5. `TESTING_GUIDE.md`
6. `SUBMISSION.md`

---

## Common Questions

| Question | Best Document |
|---|---|
| What does this project do? | `README.md` |
| What should I demo first? | `SUBMISSION.md` |
| How is the system structured? | `ARCHITECTURE_REFERENCE.md` |
| How do I run it locally? | `README.md` or `QUICK_IMPLEMENTATION_GUIDE.md` |
| How do I test it before submission? | `TESTING_GUIDE.md` and `SUBMISSION_READY.md` |
| How should we scope GCP deployment? | `GCP_SIMPLIFICATION_STRATEGY.md` |

---

## Documentation Problems Fixed In This Pass

- Restored the missing `README.md`
- Restored the missing `SUBMISSION.md`
- Renamed `GCP_SIMPLIFICATION_STRATEG.md` to `GCP_SIMPLIFICATION_STRATEGY.md`
- Removed references to a missing README and corrected the strategy filename
- Re-aligned the top-level docs with the actual MediRAG codebase instead of an unrelated sample concept
