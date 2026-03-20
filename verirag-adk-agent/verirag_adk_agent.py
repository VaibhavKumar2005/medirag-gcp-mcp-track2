import os
from google.adk.agents import Agent
from google.adk.tools import McpToolset
from google.adk.tools.mcp_tool import StreamableHTTPConnectionParams

# 1. Get the Backend URL from the environment
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL")

def initialize_agent():
    # 2. Setup the MCP Toolset (The connection to your Hands)
    verirag_mcp_tools = McpToolset(
        name="verirag_tools",
        connection_params=StreamableHTTPConnectionParams(
            url=f"{MCP_SERVER_URL}/mcp"
        )
    )

    # 3. Create the Agent (The Brain)
    # Using Gemini 3.1 Pro specifically for Track 2 selection
    return Agent(
        name="VeriRAG Assistant",
        model="gemini-3-1-pro-001",
        instruction="""You are a verified RAG librarian. 
        Always use the 'rag_query' and 'search_documents' tools to answer.
        Ensure every response is cross-referenced with the retrieved context.""",
        toolsets=[verirag_mcp_tools]
    )
