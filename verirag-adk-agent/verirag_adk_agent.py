"""
VeriRAG ADK Agent for Track 2 Submission
Connects to VeriRAG MCP server via Model Context Protocol
"""

import os
import json
import logging
from typing import Optional
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Try to import ADK (will work on Google Cloud)
try:
    from google.adk.agents import Agent, LlmAgentConfig
    from google.adk.tools.tool import Tool
    from google.adk.tools.mcp_tool import McpToolset
    from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
    ADK_AVAILABLE = True
    logger.info("✅ Google ADK imported successfully")
except ImportError:
    ADK_AVAILABLE = False
    logger.warning("⚠️  Google ADK not available (expected in local testing)")


class VeriRAGAgent:
    """VeriRAG Document Intelligence Agent"""
    
    def __init__(self, mcp_server_url: Optional[str] = None):
        """
        Initialize the agent.
        
        Args:
            mcp_server_url: URL to the MCP server (default: from env var or localhost)
        """
        self.mcp_server_url = mcp_server_url or os.getenv(
            "MCP_SERVER_URL", 
            "http://localhost:8000/mcp"
        )
        
        logger.info(f"🤖 Initializing VeriRAG Agent")
        logger.info(f"   MCP Server URL: {self.mcp_server_url}")
        
        if ADK_AVAILABLE:
            self._init_adk_agent()
        else:
            logger.warning("   ADK not available - using mock agent for testing")
            self.agent = None
    
    def _init_adk_agent(self):
        """Initialize the actual ADK agent"""
        try:
            # Define system prompt
            system_prompt = """You are VeriRAG, an intelligent document assistant powered by Retrieval-Augmented Generation.

Your capabilities:
1. Search across a document repository using semantic similarity
2. Retrieve relevant documents and answer questions about them
3. Generate accurate, context-aware responses
4. List available documents in the system
5. Retrieve specific sections from documents

When responding:
- Always cite which documents you used
- Provide accurate information based on retrieved context
- Be honest if information is not in the documents
- Format responses clearly with sections and bullet points
- Use the available tools to search and retrieve information

Available tools:
- search_documents: Find relevant documents by query
- rag_query: Get answers from the document corpus with context
- list_documents: See all available documents
- get_document_chunks: View specific parts of documents
- get_rag_metrics: Get system metrics and statistics

Remember: You are a document intelligence assistant. Your responses should be based on the documents you retrieve."""
            
            # Create agent config
            config = LlmAgentConfig(
                name="verirag-assistant",
                model="gemini-3-1-pro-001",
                instructions=system_prompt,
                tools=[
                    McpToolset(
                        connection_params=StreamableHTTPConnectionParams(
                            url=self.mcp_server_url
                        )
                    )
                ]
            )
            
            # Create agent
            self.agent = Agent(config)
            logger.info("✅ ADK Agent created successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize ADK agent: {e}")
            self.agent = None
    
    async def process_query(self, query: str) -> dict:
        """
        Process a user query through the agent.
        
        Args:
            query: User question or command
        
        Returns:
            Dictionary with agent response
        """
        logger.info(f"🤔 Processing query: {query}")
        
        if not self.agent:
            logger.warning("⚠️  Agent not initialized, returning mock response")
            return self._get_mock_response(query)
        
        try:
            # Process query through agent
            response = await self.agent.process(query)
            
            logger.info("✅ Query processed successfully")
            return {
                "query": query,
                "response": response,
                "status": "success"
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing query: {e}", exc_info=True)
            return {
                "query": query,
                "response": f"Error: {str(e)}",
                "status": "error"
            }
    
    def _get_mock_response(self, query: str) -> dict:
        """Get mock response for local testing"""
        mock_responses = {
            "documents": {
                "query": query,
                "response": "Based on the documents available: We have 3 documents: 'AI_Overview.pdf', 'Machine_Learning_Guide.pdf', and 'RAG_Implementation.md'. Would you like to search any specific topic?",
                "status": "success"
            },
            "search": {
                "query": query,
                "response": "I found 2 relevant documents about your topic: [AI_Overview.pdf] and [RAG_Implementation.md]. These documents contain information about your query.",
                "status": "success"
            },
            "default": {
                "query": query,
                "response": "I'm VeriRAG, your document intelligence assistant. I can help you search documents and answer questions using retrieval-augmented generation. Try asking me about documents or search queries!",
                "status": "success"
            }
        }
        
        # Try to match query to a mock response
        query_lower = query.lower()
        if "document" in query_lower or "list" in query_lower:
            return mock_responses["documents"]
        elif "search" in query_lower or "find" in query_lower:
            return mock_responses["search"]
        else:
            return mock_responses["default"]


# FastAPI wrapper for Cloud Run deployment
def create_app():
    """Create FastAPI app for Cloud Run"""
    try:
        from fastapi import FastAPI, HTTPException
        from pydantic import BaseModel
        import uvicorn
        
        app = FastAPI(
            title="VeriRAG ADK Agent API",
            description="Track 2 MCP Integration - Document Intelligence Agent",
            version="1.0.0"
        )
        
        # Initialize agent
        agent = VeriRAGAgent()
        
        # Request/Response models
        class QueryRequest(BaseModel):
            message: str
            session_id: Optional[str] = None
        
        class QueryResponse(BaseModel):
            query: str
            response: str
            status: str
            session_id: Optional[str] = None
        
        # Health check endpoint
        @app.get("/health")
        async def health_check():
            """Health check endpoint for Cloud Run"""
            return {
                "status": "healthy",
                "service": "verirag-adk-agent",
                "mcp_server": agent.mcp_server_url
            }
        
        # Query endpoint
        @app.post("/query", response_model=QueryResponse)
        async def query(request: QueryRequest):
            """Process a query through the VeriRAG agent"""
            safe_msg = request.message.replace("\n", " ").replace("\r", " ")[:100]; logger.info(f"📨 Received query (sanitized): {safe_msg}...")
            
            result = await agent.process_query(request.message)
            
            return QueryResponse(
                query=result["query"],
                response=result["response"],
                status=result["status"],
                session_id=request.session_id
            )
        
        # Info endpoint
        @app.get("/info")
        async def info():
            """Get agent info"""
            return {
                "name": "VeriRAG Assistant",
                "description": "Document Intelligence Agent with RAG",
                "model": "gemini-3-1-pro-001",
                "mcp_server": agent.mcp_server_url,
                "track": "Track 2 - Model Context Protocol",
                "status": "running"
            }
        
        # Chat endpoint (alternative format)
        @app.post("/chat")
        async def chat(request: QueryRequest):
            """Chat endpoint (alias for query)"""
            return await query(request)
        
        return app
    
    except ImportError:
        logger.error("FastAPI not installed - cannot create web app")
        return None


# Main entry point
async def main():
    """Main function for local testing"""
    logger.info("🚀 Starting VeriRAG Agent...")
    
    agent = VeriRAGAgent()
    
    # Test queries
    test_queries = [
        "What documents do we have available?",
        "Search for information about machine learning",
        "Can you summarize the main topics in the documents?"
    ]
    
    for query in test_queries:
        logger.info(f"\n❓ Query: {query}")
        result = await agent.process_query(query)
        logger.info(f"✅ Response: {result['response']}\n")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        # Run FastAPI server
        try:
            from fastapi import FastAPI
            import uvicorn
            
            app = create_app()
            
            if app:
                logger.info("🚀 Starting FastAPI server on 0.0.0.0:8080")
                uvicorn.run(app, host="0.0.0.0", port=8080)
            else:
                logger.error("Failed to create FastAPI app")
        except ImportError:
            logger.error("FastAPI/Uvicorn not installed. Install with: pip install fastapi uvicorn")
    else:
        # Run local test
        logger.info("Running local test (use 'serve' argument to start FastAPI server)")
        asyncio.run(main())
