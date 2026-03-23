# MediRAG — Submission Document

**Team 96 · Track 2: Model Context Protocol · Gen AI Academy APAC Edition**

---

## In one sentence

MediRAG is an AI agent that answers clinical questions about patient records — and refuses to answer when it isn't sure.

---

## The problem we are solving

A doctor in a rural hospital in India is treating an unconscious patient with chest pain. The patient's records were digitised three months ago. The doctor needs to know: *is this patient allergic to penicillin?*

They open an AI assistant and ask. The assistant answers confidently. It sounds correct. But it hallucinated — the allergy information it cited is not in the patient's actual records. The doctor prescribes accordingly. The patient has an anaphylactic reaction.

This is not a hypothetical. It is the default failure mode of every general-purpose language model deployed on clinical data without a verification layer. Models are trained to sound confident. In medicine, confidence without grounding is dangerous.

**Across India, Indonesia, the Philippines, and Southeast Asia, 70–80% of hospital records are still on paper.** As these records are digitised — through India's Ayushman Bharat Digital Mission, Indonesia's BPJS system, and national health programmes across the region — clinicians urgently need AI tools that can query those records safely. Tools that know the difference between "I found the answer" and "I am guessing."

MediRAG is built around one guarantee: **the system refuses to answer rather than hallucinate.**

---

## What we built

MediRAG is a clinical document intelligence system with three deployed components on Google Cloud Run:

### 1. MCP Server — the tool source

A FastMCP server that wraps the entire clinical RAG pipeline as Model Context Protocol tools. It exposes five tools via Streamable HTTP transport (MCP spec 2025-03-26):

- `search_documents` — semantic similarity search via pgvector
- `rag_query` — the full dual-agent verification pipeline
- `list_documents` — all indexed patient records
- `get_document_chunks` — raw text segments from any document
- `get_rag_metrics` — live system health snapshot

Any MCP-compatible agent or client can call these tools. The MCP layer is the separation of concerns the track requires — AI reasoning on one side, tool execution on the other.

### 2. ADK Agent — the reasoning layer

A google-adk `SequentialAgent` deployed with `adk deploy cloud_run --with_ui`. It follows the Researcher → Formatter pattern from the Google codelab:

- `clinical_researcher` (LlmAgent): calls `search_documents`, `rag_query`, and `get_rag_metrics` in sequence via `McpToolset`. Saves findings to shared state.
- `clinical_formatter` (LlmAgent): reads from shared state, formats the verified answer in a clinical-safe structure.

The `--with_ui` flag means judges visit the Cloud Run URL and immediately see the ADK developer UI. They type a question, watch the three MCP tool calls execute live, and get a verified answer with a faithfulness score.

### 3. Clinical dashboard — the full product

A React 19 frontend that shows what MediRAG looks like in actual clinical use. It includes:

- A chat interface where clinicians ask questions and see the verification pipeline animate in real time — five stages with a live progress bar and a cosine similarity score counting up to the actual value
- A Patient Records tab for uploading PDFs with live progress through the ingestion pipeline stages
- An ADK Agent tab showing the three-step MCP reasoning chain
- An Analytics tab tracking faithfulness scores, verified answers, and hallucinations blocked

---

## The core technical innovation

Most RAG systems use word overlap to check if an answer is grounded. This catches only the most obvious hallucinations — literal copy-paste errors. It misses paraphrased fabrications, invented specifics that use medically appropriate vocabulary, and plausible-sounding answers that simply aren't in the documents.

MediRAG uses **semantic cosine similarity** for verification. The Critic Agent embeds both the generated answer and the retrieved context using the same `text-embedding-004` model used for ingestion. If the answer is semantically aligned with the context, the cosine similarity is high. If the model invented something plausible but not grounded, the similarity drops — and the answer is rejected.

```
combined_score = (llm_self_reported × 0.6) + (cosine_similarity × 0.4)

score ≥ 0.6  →  return answer
score < 0.6  →  reject → Groq/Llama-3 regenerates with strict prompt
              → if still uncertain → "I cannot answer from available records"
```

Using a different model for fallback regeneration (Groq/Llama-3.3-70B instead of Gemini) provides architectural redundancy. If Gemini hallucinated on a specific query pattern, a different model with a tighter prompt is less likely to reproduce the same hallucination.

---

## Demo guide for judges

### Primary: ADK Agent (visit this URL)

`https://medirag-agent-[hash]-uc.a.run.app`

1. You see the ADK developer UI immediately — no login, no setup
2. Enable **Token Streaming** in the top right toggle
3. Type any of these questions:

**High confidence case** (score > 0.85, green badge):
> "What allergies does the patient have?"

Watch: `search_documents` finds the penicillin allergy record → `rag_query` runs verification → score 0.91 → answer returned with citation.

**Fallback trigger** (score < 0.6, Groq regenerates):
> "What is the patient's long-term cardiovascular prognosis?"

Watch: Gemini generates a speculative answer → Critic Agent scores it low → system rejects → Groq regenerates with conservative prompt.

**Refusal case** (information genuinely not in records):
> "What was the patient's childhood vaccination history?"

Watch: No relevant chunks found → faithfulness score cannot be established → system says explicitly "I cannot answer this from the available records."

---

### Secondary: Clinical dashboard

`https://verirag-frontend-[hash]-uc.a.run.app`

1. Click **"Try Demo — No account needed"**
2. Three patient scenarios are pre-loaded:
   - Acute STEMI with documented penicillin allergy (Patient: Rajesh Singh, 54)
   - Post-CABG discharge summary (Patient: Sunita Patel, 62)
   - Comprehensive metabolic panel with new diabetes diagnosis (Patient: Arjun Kumar, 38)
3. Ask clinical questions — watch the 5-stage pipeline visualizer animate with each query
4. Switch to **ADK Agent tab** to see the MCP reasoning chain

---

## Track 2 requirement checklist

| Requirement | Status | Detail |
|---|---|---|
| AI agent implemented using ADK | ✅ | `SequentialAgent` with two `LlmAgent` sub-agents |
| Uses MCP to connect to one tool | ✅ | `McpToolset` connects to MCP Server via Streamable HTTP |
| Retrieves structured data | ✅ | `rag_query` returns JSON with answer, faithfulness score, citations, RAGAS metrics |
| Uses retrieved data in response | ✅ | `clinical_formatter` reads MCP results from shared state and builds final answer |
| Deployed to Cloud Run | ✅ | `adk deploy cloud_run --with_ui` — ADK dev UI accessible at Cloud Run URL |

---

## Google Cloud services used

| Service | How it is used |
|---|---|
| **Cloud Run** | Hosts all three services — MCP Server, ADK Agent, Frontend |
| **Google Gemini API** | Primary LLM (gemini-1.5-flash) + embeddings (text-embedding-004) |
| **GCP Secret Manager** | Runtime secret retrieval — no API keys in containers or env vars |
| **Cloud Logging** | Structured audit trail for all MCP tool calls |
| **Cloud Build** | Builds Docker images from source |
| **Artifact Registry** | Stores the built container images |

---

## Repository

`https://github.com/VaibhavKumar2005/verirag-gcp-mcp-track2`

Branch: `track-2-mcp-submission`

Primary submission files:
- `verirag-adk-agent/medirag_agent/agent.py` — the ADK agent
- `apps/backend/mcp_server.py` — the MCP server
- `apps/backend/ai_engine/rag_logic.py` — the verification pipeline

---

*MediRAG · Team 96 · Gen AI Academy APAC Edition · Track 2 — Model Context Protocol*

*Clinical intelligence that refuses to guess.*
