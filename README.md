# MediSearch (MCP + ADK)

This repository now uses a minimal Google Cloud Track 2 architecture:

- `medisearch/mcp-server/`: FastAPI + FastMCP server with OpenFDA tools
- `medisearch/agent/`: Google ADK agent using `MCPToolset`

## Project Structure

```text
medisearch/
├── mcp-server/
│   ├── main.py
│   ├── requirements.txt
│   └── Procfile
└── agent/
    ├── agent.py
    └── requirements.txt
```

## MCP Tool Included

- `get_drug_label_info(drug_name: str)`: Fetches drug purpose and warnings from OpenFDA.

## Deploy MCP Server (Cloud Run)

```bash
cd medisearch/mcp-server
gcloud run deploy medisearch-mcp --source . --region us-central1 --allow-unauthenticated
```

## Get MCP URL

```bash
gcloud run services describe medisearch-mcp --region us-central1 --format='value(status.url)'
```

## Deploy ADK Agent (Cloud Run with UI)

```bash
cd ../agent
adk deploy cloud_run \
  --project YOUR_PROJECT_ID \
  --region us-central1 \
  --with_ui \
  --set-env-vars MCP_SERVER_URL=https://YOUR-MCP-URL/mcp
```
