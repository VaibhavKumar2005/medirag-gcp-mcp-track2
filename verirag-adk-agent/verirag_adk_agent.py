"""
MediRAG ADK Agent for Track 2 Submission
Connects to MediRAG MCP server via Model Context Protocol.
SECURED: Fixed Log Injection (CWE-117), Logging Format (S3457), and Network Binding (S8392).
"""

import os
import re
import json
import logging
from typing import Optional
import asyncio

# Configure logging for Cloud Run (Standard format)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Try to import ADK (Target environment: Google Cloud)
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


def sanitize_log_input(text: str, max_length: int = 100) -> str:
    """
    FIX CWE-117: Sanitize user input to prevent log injection.
    Removes newlines and carriage returns to prevent log forgery.
    """
    if not text:
        return ""
    # Replace CR/LF with underscores and truncate for safety
    clean_text = re.sub(r"[\r\n]", "_", str(text))
    return clean_text[:max_length]


class MediRAGAgent:
    """MediRAG Clinical Intelligence Agent"""
    
    def __init__(self, mcp_server_url: Optional[str] = None):
        """
        Initialize the agent with secure logging.
        """
        self.mcp_server_url = mcp_server_url or os.getenv(
            "MCP_SERVER_URL", 
            "http://localhost:8000/mcp"
        )
        
        # FIX S3457: Use normal string for static text and lazy formatting for variables
        logger.info("🤖 Initializing MediRAG Agent")
        logger.info("   MCP Server URL: %s", sanitize_log_input(self.mcp_server_url, 200))
        
        if ADK_AVAILABLE:
            self._init_adk_agent()
        else:
            logger.warning("   ADK not available - using mock agent for testing")
            self.agent = None
    
    def _init_adk_agent(self):
        """Initialize the clinical ADK agent with MediRAG persona"""
        try:
            # Define system prompt focused on Clinical Verifiability
            system_prompt = """You are MediRAG, an intelligent clinical assistant powered by Retrieval-Augmented Generation.

Your capabilities:
1. Search across a medical record repository using semantic similarity
2. Retrieve relevant clinical documents and answer questions about them
3. Generate accurate, context-aware responses with source citations
4. List available medical records in the system
5. Retrieve specific sections from clinical documents

When responding:
- Always cite which clinical records you used
- Provide accurate information based on retrieved medical context
- Be honest if information is not in the medical documents
- Format responses clearly with clinical sections and bullet points
- Use the available tools to search and retrieve information

Available tools:
- search_documents: Find relevant clinical documents by query
- rag_query: Get answers from the clinical corpus with context
- list_documents: See all available medical records
- get_document_chunks: View specific parts of clinical documents
- get_medirag_metrics: Get clinical RAG system metrics

Remember: You are a medical document intelligence assistant. Your responses should be based on the clinical documents you retrieve."""
            
            # Create agent config
            config = LlmAgentConfig(
                name="medirag-assistant",
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
            
            self.agent = Agent(config)
            logger.info("✅ ADK Agent created successfully for MediRAG")
            
        except Exception as e:
            logger.error("❌ Failed to initialize ADK agent: %s", e)
            self.agent = None
    
    async def process_query(self, query: str) -> dict:
        """
        Process a clinical query through the agent with secure logging.
        """
        # FIX S5145/CWE-117 & S3457: Sanitize and use lazy formatting
        safe_query = sanitize_log_input(query)
        logger.info("🤔 Processing clinical query: %s", safe_query)
        
        if not self.agent:
            logger.warning("⚠️  Agent not initialized, returning mock response")
            return self._get_mock_response(query)
        
        try:
            response = await self.agent.process(query)
            logger.info("✅ Query processed successfully")
            return {
                "query": query,
                "response": response,
                "status": "success"
            }
            
        except Exception as e:
            logger.error("❌ Error processing query: %s", e, exc_info=True)
            return {
                "query": query,
                "response": f"Error: {str(e)}",
                "status": "error"
            }
    
    def _get_mock_response(self, query: str) -> dict:
        """Get mock response for local testing with MediRAG branding"""
        return {
            "query": query,
            "response": "MediRAG Mock: I can help you search medical records.",
            "status": "success"
        }


# FastAPI wrapper for Cloud Run deployment
def create_app():
    """Create FastAPI app for Cloud Run with production-grade security"""
    try:
        from fastapi import FastAPI
        from pydantic import BaseModel
        
        app = FastAPI(
            title="MediRAG ADK Agent API",
            description="Track 2 MCP Integration - Clinical Document Intelligence Agent",
            version="1.0.0"
        )
        
        agent = MediRAGAgent()
        
        class QueryRequest(BaseModel):
            message: str
            session_id: Optional[str] = None
        
        @app.get("/health")
        async def health_check():
            return {"status": "healthy", "service": "medirag-adk-agent"}
        
        @app.post("/query")
        async def query(request: QueryRequest):
            # FIX S5145/CWE-117 & S3457
            safe_msg = sanitize_log_input(request.message)
            logger.info("📨 Received query (sanitized): %s...", safe_msg)
            
            result = await agent.process_query(request.message)
            return result
        
        return app
    except ImportError:
        logger.error("❌ FastAPI not installed")
        return None


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        try:
            import uvicorn
            app = create_app()
            
            if app:
                # FIX S8392: Use environment variables instead of hardcoding '0.0.0.0'
                host = os.getenv("HOST", "127.0.0.1")  # Default to safe localhost
                port = int(os.getenv("PORT", 8080))
                
                logger.info("🚀 Starting MediRAG FastAPI server on %s:%s", host, port)
                uvicorn.run(app, host=host, port=port)
            else:
                logger.error("Failed to create FastAPI app")
        except ImportError:
            logger.error("Uvicorn not installed.")
    else:
        asyncio.run(MediRAGAgent().process_query("What clinical records are available?"))
