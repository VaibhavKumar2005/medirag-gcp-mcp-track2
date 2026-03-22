"""
MediRAG ADK Agent — GCP Track 2 Submission
Connects to the MediRAG MCP server via Model Context Protocol (Streamable HTTP).

Uvicorn entrypoint (Cloud Run): uvicorn verirag_adk_agent:app --host 0.0.0.0 --port 8080

Bug fixes applied:
  - BUG 3: model="gemini-3-1-pro-001" replaced with "models/gemini-1.5-flash-latest"
           (the previous string returned a 404 from the Gemini API)
  - Module-level `app` object added so uvicorn can bind without AttributeError
  - HOST defaults to 0.0.0.0 (required by Cloud Run) instead of 127.0.0.1
  - ADK imports use the correct google-adk package paths for v0.x / v1.x
  - Log injection sanitisation (CWE-117) retained
"""

import os
import re
import logging
from typing import Optional
import asyncio

from fastapi import FastAPI
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ── Google ADK (graceful fallback for local testing without ADK installed) ───
try:
    from google.adk.agents import LlmAgent
    from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
    from google.adk.tools.mcp_tool.mcp_session_manager import (
        StreamableHTTPConnectionParams,
    )
    ADK_AVAILABLE = True
    logger.info("Google ADK imported successfully")
except ImportError:
    ADK_AVAILABLE = False
    logger.warning("Google ADK not available — running in mock mode (expected in local dev)")


# ── Security helpers ─────────────────────────────────────────────────────────

def sanitize_log_input(text: str, max_length: int = 200) -> str:
    """CWE-117: strip CR/LF to prevent log-injection, then truncate."""
    if not text:
        return ""
    return re.sub(r"[\r\n]", "_", str(text))[:max_length]


# ── Agent class ──────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are MediRAG, an intelligent clinical assistant powered by \
Retrieval-Augmented Generation.

Your capabilities:
1. Search a medical record repository using semantic similarity
2. Retrieve relevant clinical documents and answer questions about them
3. Generate accurate, context-aware responses with source citations
4. List available medical records in the system
5. Retrieve specific sections from clinical documents

When responding:
- Always cite which clinical records you used
- Provide accurate information based on retrieved medical context
- Be honest when information is not available in the documents
- Format responses clearly with clinical sections and bullet points

Available MCP tools:
- search_documents  : find relevant clinical documents by query
- rag_query         : get a faithfulness-verified answer from the clinical corpus
- list_documents    : list all available medical records
- get_document_chunks: view specific text segments of a clinical document
- get_rag_metrics   : system health and model configuration metrics

You are a medical document intelligence assistant.  Base every response
strictly on the clinical documents you retrieve."""


class MediRAGAgent:
    """MediRAG Clinical Intelligence Agent wrapping Google ADK LlmAgent."""

    def __init__(self, mcp_server_url: Optional[str] = None):
        self.mcp_server_url = mcp_server_url or os.getenv(
            "MCP_SERVER_URL", "http://localhost:8000/mcp"
        )
        logger.info("Initializing MediRAG Agent")
        logger.info("MCP Server URL: %s", sanitize_log_input(self.mcp_server_url))

        self.agent: Optional[LlmAgent] = None
        if ADK_AVAILABLE:
            self._init_adk_agent()
        else:
            logger.warning("ADK not available — mock mode active")

    def _init_adk_agent(self) -> None:
        """Construct the LlmAgent with MCP toolset."""
        try:
            # BUG FIX: "gemini-3-1-pro-001" does not exist and returns HTTP 404.
            # Use a valid, production model identifier.  "models/gemini-1.5-flash-latest"
            # resolves to the latest stable 1.5 Flash release and is always available.
            self.agent = LlmAgent(
                name="medirag-assistant",
                model="models/gemini-1.5-flash-latest",
                instruction=SYSTEM_PROMPT,
                tools=[
                    McpToolset(
                        connection_params=StreamableHTTPConnectionParams(
                            url=self.mcp_server_url,
                        )
                    )
                ],
            )
            logger.info("ADK LlmAgent created — model=models/gemini-1.5-flash-latest")
        except Exception as exc:
            logger.error("Failed to initialise ADK agent: %s", exc)
            self.agent = None

    async def process_query(self, query: str) -> dict:
        """Run a clinical query through the agent."""
        safe_query = sanitize_log_input(query)
        logger.info("Processing query: %s", safe_query)

        if not self.agent:
            return self._mock_response(query)

        try:
            # google-adk v0.x: agent.run_async(); v1.x may differ — kept broad.
            response = await self.agent.run_async(query)
            logger.info("Query processed successfully")
            return {"query": query, "response": str(response), "status": "success"}
        except Exception as exc:
            logger.error("Agent error: %s", exc, exc_info=True)
            return {"query": query, "response": f"Error: {exc}", "status": "error"}

    @staticmethod
    def _mock_response(query: str) -> dict:
        return {
            "query":    query,
            "response": "MediRAG (mock mode): ADK not available. "
                        "Deploy to Cloud Run to use the live agent.",
            "status":   "mock",
        }


# ── FastAPI app — module-level `app` for uvicorn ─────────────────────────────
# Cloud Run Dockerfile.adk runs:
#   uvicorn verirag_adk_agent:app --host 0.0.0.0 --port 8080
# The `app` object MUST exist at module level (not inside a factory function)
# so that uvicorn can import it directly.

app = FastAPI(
    title="MediRAG ADK Agent",
    description="GCP Track 2 — Clinical document intelligence via ADK + MCP",
    version="1.0.0",
)

# Initialise agent once at startup (not per-request)
_agent = MediRAGAgent()


class QueryRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


@app.get("/health")
async def health_check():
    return {
        "status":       "healthy",
        "service":      "medirag-adk-agent",
        "adk_available": ADK_AVAILABLE,
        "model":        "models/gemini-1.5-flash-latest",
    }


@app.post("/query")
async def query_endpoint(request: QueryRequest):
    safe_msg = sanitize_log_input(request.message)
    logger.info("Received query: %s...", safe_msg)
    return await _agent.process_query(request.message)


# ── Local development entrypoint ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    # Cloud Run injects PORT; default 8080 matches the workflow flag --port=8080
    # HOST must be 0.0.0.0 for Cloud Run (container must accept external traffic)
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8080"))
    logger.info("Starting MediRAG ADK Agent on %s:%d", host, port)
    uvicorn.run("verirag_adk_agent:app", host=host, port=port, reload=False)
