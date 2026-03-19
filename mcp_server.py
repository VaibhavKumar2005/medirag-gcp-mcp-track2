"""
VeriRAG MCP Server
Exposes RAG tools via Model Context Protocol for Track 2 submission
"""

import os
import sys
import django
from typing import Any

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "rag_backend.settings")
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from fastmcp import FastMCP
from ai_engine.models import Document, DocumentChunk
from ai_engine.rag_logic import RAGEngine
import logging

logger = logging.getLogger(__name__)

# Initialize FastMCP server
mcp = FastMCP(
    name="verirag-rag-server",
    version="1.0.0",
)

# Initialize RAG engine
try:
    rag_engine = RAGEngine()
    logger.info("✅ RAG Engine initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize RAG engine: {e}")
    rag_engine = None


@mcp.tool()
def search_documents(query: str, top_k: int = 5) -> dict:
    """
    Search documents using semantic similarity.
    
    Args:
        query: Search query
        top_k: Number of top results to return (default: 5, max: 20)
    
    Returns:
        Dictionary with search results
    """
    if not rag_engine:
        return {"error": "RAG engine not initialized", "results": []}
    
    try:
        # Validate inputs
        top_k = min(int(top_k), 20)  # Cap at 20
        top_k = max(1, top_k)  # Min 1
        
        logger.info(f"🔍 Searching documents for query: '{query}' (top_k={top_k})")
        
        # Call RAG engine search
        results = rag_engine.search(query, top_k=top_k)
        
        # Format results
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
        logger.error(f"❌ Search error: {e}", exc_info=True)
        return {
            "error": str(e),
            "query": query,
            "results": [],
            "status": "error"
        }


@mcp.tool()
def rag_query(question: str, use_context: bool = True) -> dict:
    """
    Full RAG inference - retrieves context and generates answer.
    
    Args:
        question: Question to answer
        use_context: Whether to use retrieved context (default: True)
    
    Returns:
        Dictionary with generated answer and sources
    """
    if not rag_engine:
        return {"error": "RAG engine not initialized", "answer": ""}
    
    try:
        logger.info(f"❓ Answering question: '{question}' (use_context={use_context})")
        
        if use_context:
            # Retrieve context
            context_docs = rag_engine.search(question, top_k=3)
            context = "\n\n".join([f"[{doc.title}]: {doc.file.name}" 
                                   for doc, _ in context_docs])
            
            # Generate answer with context
            answer = rag_engine.generate_answer(question, context)
            
            sources = [{"doc_id": str(doc.id), "title": doc.title} 
                      for doc, _ in context_docs]
        else:
            # Generate answer without context
            answer = rag_engine.generate_answer(question, None)
            sources = []
        
        return {
            "question": question,
            "answer": answer,
            "sources_count": len(sources),
            "sources": sources,
            "status": "success"
        }
        
    except Exception as e:
        logger.error(f"❌ RAG query error: {e}", exc_info=True)
        return {
            "error": str(e),
            "question": question,
            "answer": "",
            "status": "error"
        }


@mcp.tool()
def list_documents() -> dict:
    """
    List all uploaded documents.
    
    Returns:
        Dictionary with list of all documents
    """
    try:
        docs = Document.objects.all().order_by('-created_at')
        
        documents_list = []
        for doc in docs:
            chunk_count = doc.documentchunk_set.count()
            documents_list.append({
                "id": str(doc.id),
                "title": doc.title,
                "file_name": doc.file.name if doc.file else "N/A",
                "file_size_kb": doc.file.size / 1024 if doc.file else 0,
                "chunk_count": chunk_count,
                "status": doc.status if hasattr(doc, 'status') else "processed",
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
            })
        
        logger.info(f"📚 Listed {len(documents_list)} documents")
        
        return {
            "total_documents": len(documents_list),
            "documents": documents_list,
            "status": "success"
        }
        
    except Exception as e:
        logger.error(f"❌ List documents error: {e}", exc_info=True)
        return {
            "error": str(e),
            "total_documents": 0,
            "documents": [],
            "status": "error"
        }


@mcp.tool()
def get_document_chunks(doc_id: str, limit: int = 10) -> dict:
    """
    Get text chunks from a specific document.
    
    Args:
        doc_id: Document ID
        limit: Maximum chunks to return (default: 10, max: 50)
    
    Returns:
        Dictionary with document chunks
    """
    try:
        # Validate inputs
        limit = min(int(limit), 50)  # Cap at 50
        limit = max(1, limit)  # Min 1
        
        doc = Document.objects.get(id=doc_id)
        chunks = doc.documentchunk_set.all()[:limit]
        
        chunks_list = []
        for chunk in chunks:
            chunks_list.append({
                "chunk_id": str(chunk.id),
                "text": chunk.text[:500] if chunk.text else "N/A",  # Preview first 500 chars
                "embedding_model": chunk.embedding_model if hasattr(chunk, 'embedding_model') else "N/A",
                "sequence": chunk.sequence if hasattr(chunk, 'sequence') else 0,
            })
        
        logger.info(f"📄 Retrieved {len(chunks_list)} chunks from document {doc_id}")
        
        return {
            "document_id": str(doc.id),
            "document_title": doc.title,
            "chunks_count": len(chunks_list),
            "chunks": chunks_list,
            "status": "success"
        }
        
    except Document.DoesNotExist:
        logger.warning(f"⚠️  Document {doc_id} not found")
        return {
            "error": f"Document {doc_id} not found",
            "status": "not_found"
        }
    except Exception as e:
        logger.error(f"❌ Get chunks error: {e}", exc_info=True)
        return {
            "error": str(e),
            "status": "error"
        }


@mcp.tool()
def get_rag_metrics() -> dict:
    """
    Get RAG system metrics and statistics.
    
    Returns:
        Dictionary with system metrics
    """
    try:
        total_docs = Document.objects.count()
        total_chunks = DocumentChunk.objects.count()
        
        # Get model info if available
        model_info = {
            "embedding_model": "gemini-embedding-001",
            "generation_model": "gemini-1.5-pro",
        }
        
        logger.info("📊 Retrieved RAG metrics")
        
        return {
            "total_documents": total_docs,
            "total_chunks": total_chunks,
            "model_info": model_info,
            "status": "success"
        }
        
    except Exception as e:
        logger.error(f"❌ Get metrics error: {e}", exc_info=True)
        return {
            "error": str(e),
            "status": "error"
        }


async def main():
    """Main entry point for MCP server"""
    logger.info("🚀 Starting VeriRAG MCP Server...")
    logger.info(f"   Server name: {mcp.name}")
    logger.info(f"   Version: {mcp.version}")
    logger.info(f"   Tools: {', '.join([t.name for t in mcp.tools.values()])}")
    
    # Run server
    async with mcp.run_server() as server:
        logger.info("✅ MCP Server running and ready for connections")


if __name__ == "__main__":
    import asyncio
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Run async main
    asyncio.run(main())
