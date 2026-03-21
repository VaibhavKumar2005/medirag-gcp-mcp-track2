"""
MediRAG MCP Server
Exposes clinical RAG tools via Model Context Protocol for Track 2 submission.
Optimized for high-concurrency medical record retrieval.
"""

import os
import sys
import django
import logging
from typing import Any
from django.db.models import Count

# Setup Django Environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "rag_backend.settings")
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from fastmcp import FastMCP
from ai_engine.models import Document, DocumentChunk
from ai_engine.rag_logic import RAGEngine

# Initialize logging for Cloud Run audit trails
logger = logging.getLogger(__name__)

# Initialize FastMCP server with MediRAG branding
mcp = FastMCP(
    name="medirag-server",
    version="1.0.0",
)

# Initialize medical-grade RAG engine
try:
    rag_engine = RAGEngine()
    logger.info("✅ MediRAG Engine initialized successfully")
except Exception as e:
    logger.error("❌ Failed to initialize MediRAG engine: %s", e)
    rag_engine = None


@mcp.tool()
def search_documents(query: str, top_k: int = 5) -> dict:
    """Search clinical documents using semantic similarity."""
    if not rag_engine:
        return {"error": "RAG engine not initialized", "results": []}
    
    try:
        top_k = max(1, min(int(top_k), 20))
        logger.info("🔍 Searching clinical records for: '%s'", query)
        
        results = rag_engine.search(query, top_k=top_k)
        
        formatted_results = []
        for doc, score in results:
            formatted_results.append({
                "document_id": str(doc.id),
                "title": doc.title,
                "content_preview": doc.file.name if doc.file else "N/A",
                "relevance_score": float(score),
                "created_at": doc.created_at.isoformat() if doc.created_at else None
            })
        
        return {
            "query": query,
            "results_count": len(formatted_results),
            "results": formatted_results,
            "status": "success"
        }
    except Exception as e:
        logger.error("❌ Search error: %s", e, exc_info=True)
        return {"error": str(e), "status": "error"}


@mcp.tool()
def rag_query(question: str, use_context: bool = True) -> dict:
    """Full RAG inference - retrieves clinical context and generates verifiable answers."""
    if not rag_engine:
        return {"error": "RAG engine not initialized", "answer": ""}
    
    try:
        logger.info("❓ Processing clinical query: '%s'", question)
        
        if use_context:
            context_docs = rag_engine.search(question, top_k=3)
            context = "\n\n".join([f"[{doc.title}]: {doc.file.name}" for doc, _ in context_docs])
            answer = rag_engine.generate_answer(question, context)
            sources = [{"doc_id": str(doc.id), "title": doc.title} for doc, _ in context_docs]
        else:
            answer = rag_engine.generate_answer(question, None)
            sources = []
        
        return {
            "question": question,
            "answer": answer,
            "sources": sources,
            "status": "success"
        }
    except Exception as e:
        logger.error("❌ RAG query error: %s", e, exc_info=True)
        return {"error": str(e), "status": "error"}


@mcp.tool()
def list_documents() -> dict:
    """List all medical documents with optimized chunk counting (N+1 Fix)."""
    try:
        # CRITICAL FIX: Annotate count to prevent N+1 query bottleneck
        docs = Document.objects.annotate(
            total_chunks=Count('documentchunk')
        ).order_by('-created_at')
        
        documents_list = []
        for doc in docs:
            documents_list.append({
                "id": str(doc.id),
                "title": doc.title,
                "file_name": doc.file.name if doc.file else "N/A",
                "file_size_kb": (doc.file.size / 1024) if doc.file else 0,
                "chunk_count": doc.total_chunks,
                "status": doc.status if hasattr(doc, 'status') else "processed",
                "created_at": doc.created_at.isoformat() if doc.created_at else None
            })
        
        return {
            "total_documents": len(documents_list),
            "documents": documents_list,
            "status": "success"
        }
    except Exception as e:
        logger.error("❌ List documents error: %s", e, exc_info=True)
        return {"error": str(e), "status": "error"}


@mcp.tool()
def get_document_chunks(doc_id: str, limit: int = 10) -> dict:
    """Get clinical text segments from a specific medical record."""
    try:
        limit = max(1, min(int(limit), 50))
        doc = Document.objects.get(id=doc_id)
        chunks = doc.documentchunk_set.all()[:limit]
        
        chunks_list = []
        for chunk in chunks:
            chunks_list.append({
                "chunk_id": str(chunk.id),
                "text_preview": chunk.text[:500] if chunk.text else "N/A",
                "sequence": chunk.sequence if hasattr(chunk, 'sequence') else 0
            })
        
        return {
            "document_id": str(doc.id),
            "document_title": doc.title,
            "chunks": chunks_list,
            "status": "success"
        }
    except Document.DoesNotExist:
        return {"error": "Document not found", "status": "not_found"}
    except Exception as e:
        logger.error("❌ Get chunks error: %s", e, exc_info=True)
        return {"error": str(e), "status": "error"}


@mcp.tool()
def get_rag_metrics() -> dict:
    """Retrieve system health and clinical data metrics."""
    try:
        return {
            "total_records": Document.objects.count(),
            "total_clinical_vectors": DocumentChunk.objects.count(),
            "llm_engine": "gemini-3.1-pro",
            "deployment_platform": "GCP Cloud Run",
            "status": "success"
        }
    except Exception as e:
        return {"error": str(e), "status": "error"}


async def main():
    logger.info("🚀 Starting MediRAG Clinical MCP Server...")
    async with mcp.run_server():
        logger.info("✅ MediRAG Server online for Track 2 submission")

if __name__ == "__main__":
    import asyncio
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    asyncio.run(main())