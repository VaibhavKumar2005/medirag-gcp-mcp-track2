from urllib.parse import quote

import httpx
from fastapi import FastAPI
from fastmcp import FastMCP

app = FastAPI(title="medisearch-mcp")
mcp = FastMCP("medisearch-mcp")


@mcp.tool()
async def get_drug_label_info(drug_name: str):
    encoded_name = quote(drug_name.strip())
    url = (
        "https://api.fda.gov/drug/label.json"
        f"?search=openfda.generic_name:{encoded_name}&limit=1"
    )

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url)
        data = response.json()

    if "results" not in data or not data["results"]:
        return {"error": "No data found", "drug": drug_name, "source": "OpenFDA"}

    result = data["results"][0]
    return {
        "drug": drug_name,
        "purpose": result.get("purpose", [""])[0],
        "warnings": result.get("warnings", [""])[0],
        "source": "OpenFDA",
    }


app.mount("/mcp", mcp.http_app())


@app.get("/")
def root():
    return {"status": "MCP running"}
