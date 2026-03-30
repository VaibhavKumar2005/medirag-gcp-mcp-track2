import os

from google.adk import Agent
from google.adk.tools.mcp_toolset import MCPToolset

MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL")

agent = Agent(
    name="medisearch-agent",
    model="gemini-1.5-flash",
    tools=[MCPToolset(connection_params={"url": MCP_SERVER_URL})],
    instruction="""
You are a medical assistant that uses FDA data through MCP tools.

Rules:
- Always call MCP tools when the user asks for drug information.
- Return concise, structured answers with sections for purpose and warnings.
- If tool data is missing, say so clearly and do not invent details.
- Cite the source as OpenFDA.
""",
)
