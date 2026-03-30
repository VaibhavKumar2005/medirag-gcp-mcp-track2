#!/usr/bin/env pwsh
<#
.SYNOPSIS
    MediRAG Automated Testing — Tests OCR, MCP API, and full RAG pipeline locally
.DESCRIPTION
    Comprehensive test suite for Track 2 submission validation:
    - Docker services health
    - Authentication & demo mode
    - Document upload (digital + scanned)
    - OCR detection & processing
    - MCP API endpoints
    - Dual-agent RAG verification
    - Rate limiting
.PARAMETER SkipDocker
    Skip docker startup (if already running)
.PARAMETER SkipLiveTest
    Only test local stack (skip Cloud Run tests)
.EXAMPLE
    .\test-all.ps1
    .\test-all.ps1 -SkipDocker
#>

param(
    [switch]$SkipDocker,
    [switch]$SkipLiveTest
)

$ErrorActionPreference = "Continue"
$BASE_URL = "http://localhost:8000"
$RESULTS = @()

function Test-Result {
    param([string]$Name, [bool]$Pass, [string]$Message)
    $result = @{ name = $Name; pass = $Pass; message = $Message }
    $RESULTS += $result
    if ($Pass) {
        Write-Host "✓ $Name" -ForegroundColor Green
    } else {
        Write-Host "❌ $Name" -ForegroundColor Red
    }
    if ($Message) { Write-Host "  → $Message" -ForegroundColor Gray }
}

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     MediRAG Complete Testing Suite (Local & Live)           ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1: DOCKER SERVICES
# ══════════════════════════════════════════════════════════════════════════════
Write-Host "PHASE 1: Docker Services" -ForegroundColor Yellow
Write-Host "────────────────────────────────────" -ForegroundColor Yellow

if (-not $SkipDocker) {
    Write-Host "🐳 Starting docker-compose..." -ForegroundColor Cyan
    docker-compose up -d 2>&1 | Out-Null
    Write-Host "⏳ Waiting 30 seconds for services..." -ForegroundColor Gray
    Start-Sleep -Seconds 30
}

$services = @("rag-backend", "rag-db", "rag-redis", "rag-celery-worker")
foreach ($svc in $services) {
    $running = docker inspect -f '{{.State.Running}}' $svc 2>$null
    Test-Result "Service: $svc" ($running -eq "true") $($running -eq "true" ? "Running" : "Not running")
}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2: HEALTH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPHASE 2: Health Checks" -ForegroundColor Yellow
Write-Host "────────────────────────────────────" -ForegroundColor Yellow

try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/health/" -TimeoutSec 5
    Test-Result "Health endpoint (/health/)" ($health.status -eq "healthy") "Status: $($health.status)"
} catch {
    Test-Result "Health endpoint (/health/)" $false $_.Exception.Message
}

try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/api/health/" -TimeoutSec 5
    $dbStatus = $health.services.postgresql.status
    $redisStatus = $health.services.redis.status
    Test-Result "API health check" ($health.healthy -eq $true) "DB: $dbStatus, Redis: $redisStatus"
} catch {
    Test-Result "API health check" $false $_.Exception.Message
}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3: AUTHENTICATION & DEMO MODE
# ══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPHASE 3: Authentication" -ForegroundColor Yellow
Write-Host "────────────────────────────────────" -ForegroundColor Yellow

try {
    $demoResponse = Invoke-RestMethod -Uri "$BASE_URL/api/demo/token/" -Method Post -TimeoutSec 5
    $global:token = $demoResponse.access
    Test-Result "Demo token generation" ($null -ne $global:token) "Token length: $($global:token.Length) chars"
    Test-Result "Demo user created" ($null -ne $demoResponse.user.email) "Email: $($demoResponse.user.email)"
} catch {
    Test-Result "Demo token generation" $false $_.Exception.Message
    $global:token = $null
}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4: DOCUMENT OPERATIONS
# ══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPHASE 4: Document Operations" -ForegroundColor Yellow
Write-Host "────────────────────────────────────" -ForegroundColor Yellow

if ($global:token) {
    $headers = @{ Authorization = "Bearer $global:token" }
    
    # Get documents list
    try {
        $docs = Invoke-RestMethod -Uri "$BASE_URL/api/documents/" -Headers $headers -TimeoutSec 5
        Test-Result "Document list retrieval" ($null -ne $docs) "Total docs: $($docs.Count)"
    } catch {
        Test-Result "Document list retrieval" $false $_.Exception.Message
    }
    
    # Create test PDF
    $testPdf = "$env:TEMP\test-doc.pdf"
    @"
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 50 >> stream
BT /F1 18 Tf 40 80 Td (Test PDF) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000352 00000 n 
trailer << /Root 1 0 R /Size 6 >>
startxref
422
%%EOF
"@ | Out-File -Path $testPdf -Encoding ASCII
    
    # Upload document
    try {
        $uploadBody = @{
            title = "Test Document"
            file  = Get-Item $testPdf
        }
        $uploadResponse = Invoke-RestMethod -Uri "$BASE_URL/api/documents/" -Method Post -Headers $headers -Form $uploadBody -TimeoutSec 10
        $global:docId = $uploadResponse.id
        Test-Result "Document upload" ($null -ne $global:docId) "Document ID: $global:docId"
        Test-Result "Document processing status" ($uploadResponse.processing_status -eq "queued" -or $uploadResponse.processing_status -eq "processing") "Status: $($uploadResponse.processing_status)"
    } catch {
        Test-Result "Document upload" $false $_.Exception.Message
        $global:docId = $null
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 5: OCR DETECTION
# ══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPHASE 5: OCR Processing" -ForegroundColor Yellow
Write-Host "────────────────────────────────────" -ForegroundColor Yellow

if ($global:token -and $global:docId) {
    $headers = @{ Authorization = "Bearer $global:token" }
    
    # Wait for processing
    Write-Host "⏳ Waiting 10 seconds for OCR/ingestion..." -ForegroundColor Gray
    Start-Sleep -Seconds 10
    
    # Check document status
    try {
        $docStatus = Invoke-RestMethod -Uri "$BASE_URL/api/documents/$global:docId/" -Headers $headers -TimeoutSec 5
        Test-Result "Document processing" $docStatus.processed "Processed: $($docStatus.processed)"
    } catch {
        Test-Result "Document processing" $false $_.Exception.Message
    }
    
    # Check worker logs for OCR
    $celeryLogs = docker logs rag-celery-worker --tail 20 2>&1
    $hasOCR = $celeryLogs | Select-String -Pattern "Cloud Vision|OCR|extraction" -Quiet
    Test-Result "OCR execution" $hasOCR "OCR logs detected in celery worker"
}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 6: MCP API ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPHASE 6: MCP API" -ForegroundColor Yellow
Write-Host "────────────────────────────────────" -ForegroundColor Yellow

# MCP Health via main health endpoint
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/health/" -TimeoutSec 5
    Test-Result "MCP server initialized" ($health.mcp_endpoint -eq "/mcp") "Endpoint: $($health.mcp_endpoint)"
} catch {
    Test-Result "MCP server initialized" $false $_.Exception.Message
}

# Test MCP tools (via HTTP)
try {
    $metricsResponse = Invoke-RestMethod -Uri "$BASE_URL/api/rag/metrics/" -TimeoutSec 5
    Test-Result "get_rag_metrics MCP tool" ($null -ne $metricsResponse.total_documents) "Total docs: $($metricsResponse.total_documents)"
} catch {
    Test-Result "get_rag_metrics MCP tool" $false $_.Exception.Message
}

# Test search via MCP-like endpoint
if ($global:token) {
    $headers = @{ Authorization = "Bearer $global:token" }
    try {
        $searchBody = @{ query = "test" } | ConvertTo-Json
        $searchResponse = Invoke-RestMethod -Uri "$BASE_URL/api/rag/search/" -Method Post -Headers $headers -Body $searchBody -ContentType "application/json" -TimeoutSec 5
        Test-Result "search_documents MCP tool" ($null -ne $searchResponse) "Results: $($searchResponse.Count)"
    } catch {
        Test-Result "search_documents MCP tool" $false $_.Exception.Message
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 7: RAG QUERY VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPHASE 7: RAG Query Pipeline" -ForegroundColor Yellow
Write-Host "────────────────────────────────────" -ForegroundColor Yellow

if ($global:token) {
    $headers = @{
        Authorization = "Bearer $global:token"
        "Content-Type" = "application/json"
    }
    
    try {
        $queryBody = @{
            query = "What is this document about?"
            demo_mode = $true
        } | ConvertTo-Json
        
        $queryResponse = Invoke-RestMethod -Uri "$BASE_URL/api/query/" -Method Post -Headers $headers -Body $queryBody -TimeoutSec 30
        Test-Result "RAG query execution" ($null -ne $queryResponse.answer) "Response length: $($queryResponse.answer.Length) chars"
        Test-Result "Dual-agent verification" ($null -ne $queryResponse.faithfulness_score) "Faithfulness: $($queryResponse.faithfulness_score)"
        Test-Result "Fallback logic available" ($null -ne $queryResponse.fallback_used) "Fallback used: $($queryResponse.fallback_used)"
    } catch {
        "Query endpoint" $false $_.Exception.Message
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 8: RATE LIMITING
# ══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPHASE 8: Security & Rate Limiting" -ForegroundColor Yellow
Write-Host "────────────────────────────────────" -ForegroundColor Yellow

if ($global:token) {
    $headers = @{ Authorization = "Bearer $global:token" }
    
    # Try rapid requests
    $rateLimited = $false
    for ($i = 0; $i -lt 3; $i++) {
        try {
            $queryBody = @{ query = "test" } | ConvertTo-Json
            $response = Invoke-RestMethod -Uri "$BASE_URL/api/query/" -Method Post -Headers $headers -Body $queryBody -TimeoutSec 5
        } catch {
            if ($_.Exception.Message -match "429|throttle") {
                $rateLimited = $true
                break
            }
        }
    }
    
    Test-Result "Rate limiting enforcement" $rateLimited "Rate limits should trigger on suspicious patterns"
}

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
$passed = ($RESULTS | Where-Object { $_.pass } | Measure-Object).Count
$total = $RESULTS.Count
$failPercentage = [Math]::Round((($total - $passed) / $total) * 100)

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                     Test Summary                            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n📊 Results: $passed / $total passed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })

$failedTests = $RESULTS | Where-Object { -not $_.pass }
if ($failedTests.Count -gt 0) {
    Write-Host "`n❌ Failed tests:" -ForegroundColor Red
    $failedTests | ForEach-Object {
        Write-Host "  • $($_.name): $($_.message)" -ForegroundColor Red
    }
}

if ($passed -eq $total) {
    Write-Host "`n✅ All tests passed! Ready for submission." -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. git add ." -ForegroundColor White
    Write-Host "  2. git commit -m 'feat: Complete MediRAG with OCR and MCP API'" -ForegroundColor White
    Write-Host "  3. git push origin track-2-mcp-submission" -ForegroundColor White
    exit 0
} else {
    Write-Host "`n⚠️  Some tests failed. Fix issues before submitting." -ForegroundColor Yellow
    exit 1
}
