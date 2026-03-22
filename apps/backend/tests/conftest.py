"""
MediRAG Test Configuration
Pytest fixtures with mocked Vault, database, and clinical LLM services.
"""

import os
import pytest
from unittest.mock import patch, MagicMock

# ── Django Setup ─────────────────────────────────────────────────────────
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "rag_backend.settings")
os.environ.setdefault("USE_SQLITE_FOR_TESTS", "1")

import django
django.setup()

from django.contrib.auth.models import User
from rest_framework.test import APIClient
from ai_engine.models import Document

# ============================================================================
# CONSTANTS & CONFIGURATION (Maintainability Fix)
# ============================================================================
# Centralizing the Vault client path to avoid duplication (SonarQube S1192)
VAULT_CLIENT_PATH = "ai_engine.rag_logic.hvac.Client"

# ============================================================================
# AUTHENTICATION FIXTURES
# ============================================================================

@pytest.fixture
def user(db):
    """Create a test user for medical record access."""
    return User.objects.create_user(
        username="clinical_tester",
        password="testpass123",
        email="medirag@example.dev",
    )


@pytest.fixture
def api_client(user):
    """Return an authenticated DRF APIClient."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def anon_client():
    """Return an unauthenticated DRF APIClient for security testing."""
    return APIClient()


# ============================================================================
# DOCUMENT FIXTURES (Clinical Focus)
# ============================================================================

@pytest.fixture
def sample_document(user, tmp_path):
    """Create a sample clinical document instance with a dummy file."""
    dummy_pdf = tmp_path / "patient_record.pdf"
    dummy_pdf.write_bytes(b"%PDF-1.4 dummy clinical content")
    doc = Document.objects.create(
        title="Sample Patient History",
        file=dummy_pdf.name,
        user=user,
        processed=False,
    )
    return doc


@pytest.fixture
def processed_document(user, tmp_path):
    """Create a pre-processed medical record."""
    dummy_pdf = tmp_path / "processed_lab_report.pdf"
    dummy_pdf.write_bytes(b"%PDF-1.4 processed content")
    doc = Document.objects.create(
        title="Diagnostic Report (Processed)",
        file=str(dummy_pdf),
        user=user,
        processed=True,
    )
    return doc


# ============================================================================
# VAULT MOCK FIXTURES (Optimized with Constant)
# ============================================================================

@pytest.fixture
def mock_vault():
    """
    Mock HashiCorp Vault client using VAULT_CLIENT_PATH constant.
    Ensures secure medical API keys are 'retrieved' correctly.
    """
    with patch.dict("os.environ", {"VAULT_TOKEN": "test-vault-token"}, clear=False), \
         patch(VAULT_CLIENT_PATH) as MockClient:
        instance = MockClient.return_value
        instance.is_authenticated.return_value = True
        instance.sys.is_initialized.return_value = True
        instance.sys.read_seal_status.return_value = {"sealed": False}
        instance.secrets.kv.v2.read_secret_version.return_value = {
            "data": {
                "data": {
                    "GOOGLE_API_KEY": "fake-google-clinical-key",
                    "GROQ_API_KEY": "fake-groq-clinical-key",
                }
            }
        }
        yield instance


@pytest.fixture
def mock_vault_sealed():
    """Mock a sealed Vault instance using centralized constant."""
    with patch(VAULT_CLIENT_PATH) as MockClient:
        instance = MockClient.return_value
        instance.is_authenticated.return_value = True
        instance.sys.is_initialized.return_value = True
        instance.sys.read_seal_status.return_value = {"sealed": True}
        yield instance


@pytest.fixture
def mock_vault_unreachable():
    """Mock an unreachable Vault instance using centralized constant."""
    with patch(VAULT_CLIENT_PATH) as MockClient:
        MockClient.side_effect = Exception("Vault Connection Refused")
        yield MockClient


# ============================================================================
# LLM MOCK FIXTURES (Gemini 1.5 Pro Focus for Track 2)
# ============================================================================

@pytest.fixture
def mock_gemini():
    """Mock Gemini 1.5 Pro responses for clinical verification."""
    with patch("ai_engine.rag_logic.AzureOpenAI") as MockLLM:
        mock_client = MockLLM.return_value
        mock_choice = MagicMock()
        # Simulated verifiable JSON response
        mock_choice.message.content = '{"answer": "Diagnosis confirmed via context", "faithfulness_score": 0.98, "explanation": "Direct clinical reference found", "source_citation": "Section 2.1"}'
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create.return_value = mock_response
        yield mock_client


@pytest.fixture
def mock_gemini_failing():
    """Mock LLM failure to test MediRAG resilience."""
    with patch("ai_engine.rag_logic.AzureOpenAI") as MockLLM:
        MockLLM.side_effect = Exception("Vertex AI Service Unavailable")
        yield MockLLM

# ============================================================================
# HEALTH CHECK FIXTURES
# ============================================================================

@pytest.fixture
def mock_redis():
    """Mock Redis connection for cloud health checks."""
    with patch("ai_engine.views.redis") as mock_redis_mod:
        mock_conn = MagicMock()
        mock_conn.ping.return_value = True
        mock_redis_mod.from_url.return_value = mock_conn
        yield mock_conn


@pytest.fixture
def mock_vault_health():
    """Mock Vault for health check endpoints specifically."""
    with patch("ai_engine.views.hvac.Client") as MockClient:
        instance = MockClient.return_value
        instance.sys.read_seal_status.return_value = {"sealed": False}
        yield instance
