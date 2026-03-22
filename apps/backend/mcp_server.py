"""
MediRAG MCP Server — GCP Track 2 Submission
Exposes clinical RAG tools via Model Context Protocol (FastMCP >= 2.x).

Uvicorn entrypoint:  uvicorn mcp_server:app --host 0.0.0.0 --port 8000

Architecture:
  - FastAPI  handles /health and the outer HTTP surface
  - FastMCP  handles /mcp  (Streamable HTTP transport, MCP spec 2025-03-26)
  - The two are composed via FastAPI.mount(), giving a single ASGI 'app' object
    that Uvicorn can bind to without any AttributeError.

Bug fixed: previous version used the wrong ASGI mount method (does not exist in
FastMCP >= 2.x.  The correct method is mcp.http_app() which returns a proper
Starlette sub-application implementing the Streamable HTTP transport.
"""

import os
import sys
import logging
from django.db.models import Count

# ── Django bootstrap (must happen before any model imports) ──────────────────
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "rag_backend.settings")
sys.path.insert(0, os.path.dirname(__file__))

import django
django.setup()

from fastapi import FastAPI
from fastmcp import FastMCP
from ai_engine.models import Document, DocumentChunk
from ai_engine.rag_logic import get_verified_answer, get_vector_store

logger = logging.getLogger(__name__)

# ── FastMCP server (MCP protocol layer) ──────────────────────────────────────
mcp = FastMCP(
    name="medirag-server",
    version="1.0.0",
)

# ── FastAPI outer app (uvicorn entrypoint: uvicorn mcp_server:app) ────────────
app = FastAPI(
    title="MediRAG MCP Server",
    description="GCP Track 2 — Clinical RAG tools via Model Context Protocol",
    version="1.0.0",
)

# BUG FIX: Use mcp.http_app() — the correct Streamable HTTP transport method.
# http_app() returns the Starlette ASGI application that implements the
# MCP Streamable HTTP transport (spec 2025-03-26).  The old mount method was removed
# in FastMCP v2 and never existed in v3.x releases.
app.mount("/mcp", mcp.http_app())


@app.get("/health")
async def health():
    """Cloud Run liveness / readiness probe."""
    return {
        "status": "healthy",
        "service": "medirag-mcp-server",
        "mcp_endpoint": "/mcp",
    }


# ── MCP Tools ────────────────────────────────────────────────────────────────

@mcp.tool()
def search_documents(query: str, top_k: int = 5) -> dict:
    """
    Search clinical documents using semantic similarity via pgvector.
    Returns ranked results with document metadata and content previews.
    """
    try:
        top_k = max(1, min(int(top_k), 20))
        logger.info("Semantic search for: '%s' (top_k=%d)", query, top_k)
        vector_db = get_vector_store()
        results = vector_db.similarity_search_with_score(query, k=top_k)

        formatted = []
        for doc, score in results:
            formatted.append({
                "document_id":     doc.metadata.get("document_id", "unknown"),
                "title":           doc.metadata.get("document_title", "unknown"),
                "content_preview": doc.page_content[:300],
                "relevance_score": round(float(score), 4),
                "page":            doc.metadata.get("page", "unknown"),
            })

        return {
            "query":         query,
            "results_count": len(formatted),
            "results":       formatted,
            "status":        "success",
        }
    except Exception as e:
        logger.error("search_documents error: %s", e, exc_info=True)
        return {"error": str(e), "status": "error"}


@mcp.tool()
def rag_query(question: str, user_id: str = "public") -> dict:
    """
    Full RAG inference with dual-agent faithfulness verification.

    Pipeline:
      1. Retrieve top-5 chunks from pgvector
      2. Gemini 1.5 Flash generates a JSON-structured answer
      3. Critic Agent scores faithfulness (semantic cosine similarity)
      4. If score < 0.6, Groq/Llama-3 regenerates with a stricter prompt
      5. Returns answer + faithfulness score + source citations
    """
    try:
        logger.info("RAG query from user '%s': '%s'", user_id, question[:80])
        result = get_verified_answer(query=question, user_id=user_id)
        return {
            "question":            question,
            "answer":              result.get("answer", ""),
            "faithfulness_score":  result.get("faithfulness_score", 0.0),
            "verification_passed": result.get("verification_passed", False),
            "model_used":          result.get("model_used", "unknown"),
            "source_citation":     result.get("source_citation", ""),
            "evidence_items":      result.get("evidence_items", []),
            "evaluation":          result.get("evaluation", {}),
            "status":              "success",
        }
    except Exception as e:
        logger.error("rag_query error: %s", e, exc_info=True)
        return {"error": str(e), "status": "error"}


@mcp.tool()
def list_documents() -> dict:
    """List all indexed medical documents with chunk counts (single query, N+1-safe)."""
    try:
        docs = Document.objects.annotate(
            total_chunks=Count("documentchunk")
        ).order_by("-created_at")

        documents_list = [
            {
                "id":           str(doc.id),
                "title":        doc.title,
                "file_name":    doc.file.name if doc.file else "N/A",
                "file_size_kb": round((doc.file.size / 1024), 1) if doc.file else 0,
                "chunk_count":  doc.total_chunks,
                "status":       getattr(doc, "status", "processed"),
                "created_at":   doc.created_at.isoformat() if doc.created_at else None,
            }
            for doc in docs
        ]

        return {
            "total_documents": len(documents_list),
            "documents":       documents_list,
            "status":          "success",
        }
    except Exception as e:
        logger.error("list_documents error: %s", e, exc_info=True)
        return {"error": str(e), "status": "error"}


@mcp.tool()
def get_document_chunks(doc_id: str, limit: int = 10) -> dict:
    """Retrieve raw text segments from a specific clinical document."""
    try:
        limit = max(1, min(int(limit), 50))
        doc   = Document.objects.get(id=doc_id)
        chunks = doc.documentchunk_set.all()[:limit]

        return {
            "document_id":    str(doc.id),
            "document_title": doc.title,
            "chunks": [
                {
                    "chunk_id":     str(c.id),
                    "text_preview": c.text[:500] if c.text else "N/A",
                    "sequence":     getattr(c, "sequence", 0),
                }
                for c in chunks
            ],
            "status": "success",
        }
    except Document.DoesNotExist:
        return {"error": "Document not found", "status": "not_found"}
    except Exception as e:
        logger.error("get_document_chunks error: %s", e, exc_info=True)
        return {"error": str(e), "status": "error"}


@mcp.tool()
def get_rag_metrics() -> dict:
    """Return live system health metrics and model configuration."""
    try:
        return {
            "total_records":          Document.objects.count(),
            "total_clinical_vectors": DocumentChunk.objects.count(),
            "llm_primary":            "gemini-1.5-flash",
            "llm_fallback":           "groq/llama-3.3-70b-versatile",
            "embedding_model":        "text-embedding-004 (768-dim)",
            "vector_store":           "PostgreSQL 16 + pgvector",
            "deployment_platform":    "GCP Cloud Run",
            "mcp_transport":          "Streamable HTTP (spec 2025-03-26)",
            "status":                 "success",
        }
    except Exception as e:
        return {"error": str(e), "status": "error"}
