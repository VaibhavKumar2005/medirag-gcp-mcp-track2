"""
MediRAG Clinical Intelligence Agent
====================================
Track 2 — Model Context Protocol | Gen AI Academy APAC Edition

Architecture follows the ADK codelab pattern (zoo-tour-guide):
  SequentialAgent: Researcher → Formatter
  - Researcher uses MCPToolset to call the MediRAG MCP server
  - Formatter presents the verified answer in a clinical-safe format

MCP tools consumed (from apps/backend/mcp_server.py):
  search_documents    — semantic similarity search via pgvector
  rag_query           — full dual-agent faithfulness pipeline
  get_rag_metrics     — live system health snapshot

Deployment:
  adk deploy cloud_run medirag_agent \\
    --project=$GCP_PROJECT_ID \\
    --region=us-central1 \\
    --with_ui

HIPAA alignment:
  - No PHI is logged (sanitize_log_input strips PII patterns before logging)
  - MCP server runs in the same GCP project — no cross-boundary data transfer
  - All transport over HTTPS (Cloud Run enforces TLS)
  - User-level document isolation enforced in the MCP server layer (user_id filter)
  - Minimum necessary access: agent only sees search + query + metrics tools
"""

import os
import re
import logging

from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
MCP_SERVER_URL = os.environ.get(
    "MCP_SERVER_URL",
    "https://verirag-mcp-server-xxxx-uc.a.run.app/mcp",
)
MODEL = os.environ.get("AGENT_MODEL", "gemini-1.5-flash")


# ── HIPAA: sanitize user input before any logging ────────────────────────────
def _safe_log(text: str, max_len: int = 120) -> str:
    """Strip newlines (log injection) and truncate. Never log full clinical text."""
    return re.sub(r"[\r\n\x00-\x1f]", "_", str(text))[:max_len]


# ── MCP toolset — connects to the MediRAG MCP server ─────────────────────────
# tool_filter limits the agent to exactly the tools it needs.
# This follows the principle of minimum necessary access (HIPAA §164.312(a)(1))
# and prevents the model from calling mutating tools it doesn't need.
mcp_toolset = McpToolset(
    connection_params=StreamableHTTPConnectionParams(url=MCP_SERVER_URL),
    tool_filter=["search_documents", "rag_query", "get_rag_metrics"],
)


# ── Agent 1: Clinical Researcher ──────────────────────────────────────────────
# Follows the codelab Researcher pattern: uses tools to gather data,
# saves findings for the Formatter via shared state.
researcher = LlmAgent(
    name="clinical_researcher",
    model=MODEL,
    tools=[mcp_toolset],
    instruction="""You are the Clinical Research component of the MediRAG system.

Your job is to answer ONE clinical question by calling the MCP tools in this order:

STEP 1 — Call search_documents(query=<the question>)
Find which patient records are relevant. Note the document titles and relevance scores.

STEP 2 — Call rag_query(question=<the question>)
This runs the full dual-agent verification pipeline:
• Gemini 1.5 Flash generates a structured answer from retrieved context
• Critic Agent scores faithfulness using cosine similarity (answer vs. context)
• Combined score = 60% self-reported + 40% semantic similarity
• If combined score < 0.6 → Groq/Llama-3 regenerates with a stricter prompt

STEP 3 — Call get_rag_metrics() 
Append a system confidence snapshot to your findings.

CRITICAL CLINICAL SAFETY RULES:
• Only state facts present in the retrieved documents
• If faithfulness_score < 0.6, explicitly note: "Fallback model served this answer"
• If no relevant documents found, say: "No records found for this query"
• NEVER fabricate drug dosages, allergy information, diagnoses, or lab values
• NEVER speculate beyond what the documents contain
• Always cite which document the answer comes from

Output your complete findings including the raw tool results.""",
    output_key="research_findings",
)


# ── Agent 2: Clinical Response Formatter ─────────────────────────────────────
# Follows the codelab Formatter pattern: takes raw data from Researcher
# and presents it in a clear, safe clinical format.
formatter = LlmAgent(
    name="clinical_formatter",
    model=MODEL,
    instruction="""You are the Clinical Response Formatter for MediRAG.

You receive raw research findings from the Clinical Researcher (in {research_findings})
and present them as a clear, structured clinical response.

FORMAT YOUR RESPONSE EXACTLY AS:

**Clinical Answer**
[The verified answer in 1-3 clear sentences]

**Verification Status**
• Faithfulness score: [X.XX] — [Verified / Safety fallback triggered]
• Model: [gemini / groq-llama3]
• Source: [document title and section]

**Evidence**
[Key facts from the retrieved documents, cited by source]

**System Confidence**
[One line summary from get_rag_metrics results]

SAFETY RULES:
• If the researcher found no relevant records, state: "I cannot answer this from the available records."
• Never add information not present in the research findings
• Flag any response where faithfulness_score < 0.6 with: ⚠️ LOW CONFIDENCE — VERIFY INDEPENDENTLY
• This system is a clinical decision SUPPORT tool, not a diagnostic authority""",
)


# ── Root agent — SequentialAgent following the codelab pattern ───────────────
# researcher runs first, then formatter reads research_findings from state.
# This is the "separation of concerns" the codelab demonstrates:
#   reasoning layer (formatter) ≠ tool execution layer (researcher + MCP)
root_agent = SequentialAgent(
    name="medirag_clinical_agent",
    description=(
        "MediRAG: Verified clinical intelligence agent. "
        "Answers questions about patient records using a dual-agent "
        "faithfulness verification pipeline via MCP tools."
    ),
    sub_agents=[researcher, formatter],
)

logger.info(
    "MediRAG agent initialized — MCP: %s | Model: %s",
    _safe_log(MCP_SERVER_URL),
    MODEL,
)
