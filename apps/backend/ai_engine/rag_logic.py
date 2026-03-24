"""
VeriRAG AI Engine — GCP-Native Implementation
Primary LLM  : Google Gemini 1.5 Flash (via google-generativeai SDK)
Embeddings   : Google text-embedding-004 (768-dim, via langchain-google-genai)
Vector store : PostgreSQL + pgvector (via langchain-community PGVector)
Fallback LLM : Groq / Llama-3.3-70B
Secrets      : HashiCorp Vault (local) -> GCP Secret Manager (Cloud Run)
"""

import os
import json
import logging
import re
import time
import hvac
from functools import lru_cache

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores.pgvector import PGVector
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI                  # used only for Groq (OpenAI-compatible endpoint)
from prometheus_client import Counter, Histogram, Gauge
from ai_engine.models import Document

# Tracing — graceful no-op fallback
try:
    from ai_engine.tracing import (
        trace_span, trace_context, add_span_attributes, record_event, get_trace_id,
    )
except ImportError:
    def trace_span(*a, **k):
        def d(f): return f
        return d
    def trace_context(*a, **k):
        from contextlib import nullcontext
        return nullcontext()
    def add_span_attributes(*a, **k): pass
    def record_event(*a, **k): pass
    def get_trace_id(): return None

logger = logging.getLogger(__name__)

# ============================================================================
# PROMETHEUS METRICS
# ============================================================================
VERIFICATION_REJECTIONS = Counter(
    'verirag_hallucination_rejections_total',
    'Total AI responses rejected for low faithfulness'
)
LLM_FALLBACKS = Counter(
    'verirag_llm_fallbacks_total',
    'Times the system switched to the backup LLM'
)
QUERIES_TOTAL = Counter(
    'verirag_queries_total',
    'Total RAG queries processed'
)
DOCUMENTS_INGESTED = Counter(
    'verirag_documents_ingested_total',
    'Documents successfully ingested'
)
FAITHFULNESS_HISTOGRAM = Histogram(
    'verirag_faithfulness_score',
    'Distribution of faithfulness scores',
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
)
ACTIVE_MODEL = Gauge(
    'verirag_active_model',
    'Currently active LLM (1=Gemini, 2=Groq)',
)
ACTIVE_MODEL.set(1)

# ============================================================================
# CONFIGURATION
# ============================================================================
DB_USER = os.environ.get("POSTGRES_USER", "admin")
DB_PASS = os.environ.get("POSTGRES_PASSWORD", "devpassword")
DB_HOST = os.environ.get("POSTGRES_HOST", "rag-db")
DB_PORT = os.environ.get("POSTGRES_PORT", "5432")
DB_NAME = os.environ.get("POSTGRES_DB", "verirag_db")
CONNECTION_STRING = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

COLLECTION_NAME = "verirag_documents"
GEMINI_MODEL    = os.environ.get("GEMINI_MODEL",    "gemini-1.5-flash")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "models/text-embedding-004")

FAITHFULNESS_THRESHOLD = 0.6
SIMILARITY_THRESHOLD   = 0.7

# ============================================================================
# SECRET RETRIEVAL — HashiCorp Vault (local) -> GCP Secret Manager (cloud)
# ============================================================================
_api_key_cache: dict = {}
CACHE_TTL = 300

DEPLOY_MODE    = os.environ.get("DEPLOY_MODE", "local").lower()
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")

if GCP_PROJECT_ID:
    DEPLOY_MODE = "cloud"


def _get_vault_client():
    vault_url   = os.environ.get("VAULT_ADDR", "http://rag-vault:8200")
    vault_token = os.environ.get("VAULT_TOKEN")
    if not vault_token:
        return None, "VAULT_TOKEN not set"
    try:
        client = hvac.Client(url=vault_url, token=vault_token)
        if not client.is_authenticated():
            return None, "Vault authentication failed"
        return client, None
    except Exception as e:
        return None, str(e)


def get_api_key_from_vault(key_name="GOOGLE_API_KEY"):
    """
    Cloud Run  -> GCP Secret Manager (Workload Identity, no credentials in container).
    Local dev  -> HashiCorp Vault KV v2 at secret/myapp.
    Fallback   -> environment variable of the same name.
    """
    current_time = time.time()
    cached = _api_key_cache.get(key_name)
    if cached and (current_time - cached["ts"]) < CACHE_TTL:
        return cached["value"]

    api_key = None

    if DEPLOY_MODE == "cloud" and GCP_PROJECT_ID:
        try:
            from google.cloud import secretmanager
            client  = secretmanager.SecretManagerServiceClient()
            name    = f"projects/{GCP_PROJECT_ID}/secrets/{key_name}/versions/latest"
            resp    = client.access_secret_version(request={"name": name})
            api_key = resp.payload.data.decode("UTF-8").strip()
            if api_key:
                _api_key_cache[key_name] = {"value": api_key, "ts": current_time}
                logger.info("Retrieved %s from GCP Secret Manager (cached %ss)", key_name, CACHE_TTL)
                return api_key
        except ImportError:
            logger.error("google-cloud-secret-manager not installed")
        except Exception as e:
            logger.error("GCP Secret Manager error for %s: %s", key_name, e)
    else:
        try:
            client, err = _get_vault_client()
            if client is None:
                logger.warning("Vault unavailable (%s), env fallback for %s", err, key_name)
                return os.environ.get(key_name)
            secret_response = client.secrets.kv.v2.read_secret_version(
                path="myapp", mount_point="secret"
            )
            api_key = secret_response["data"]["data"].get(key_name)
            if api_key:
                _api_key_cache[key_name] = {"value": api_key, "ts": current_time}
                logger.info("Retrieved %s from Vault (cached %ss)", key_name, CACHE_TTL)
                return api_key
        except hvac.exceptions.VaultError as ve:
            logger.error("Vault API error for %s: %s", key_name, ve)
        except Exception as e:
            logger.error("Vault connection error for %s: %s", key_name, e)

    logger.warning("%s not found in secret backend, env fallback", key_name)
    return os.environ.get(key_name)


def get_google_api_key():
    return get_api_key_from_vault("GOOGLE_API_KEY") or os.environ.get("GOOGLE_API_KEY")

def get_groq_api_key():
    return get_api_key_from_vault("GROQ_API_KEY") or os.environ.get("GROQ_API_KEY")


# ============================================================================
# GCP EMBEDDING MODEL — Google text-embedding-004, 768-dim
# ============================================================================
@lru_cache(maxsize=1)
def get_embedding_model():
    api_key = get_google_api_key()
    if not api_key:
        raise ValueError(
            "GOOGLE_API_KEY not found. Set it in GCP Secret Manager (cloud) "
            "or Vault/environment (local)."
        )
    return GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        google_api_key=api_key,
    )


# ============================================================================
# PGVECTOR STORE
# ============================================================================
@lru_cache(maxsize=1)
def get_vector_store():
    return PGVector(
        collection_name=COLLECTION_NAME,
        connection_string=CONNECTION_STRING,
        embedding_function=get_embedding_model(),
    )


# ============================================================================
# HELPERS
# ============================================================================
def _build_evidence_payload(docs):
    evidence = []
    for i, doc in enumerate(docs, start=1):
        page  = doc.metadata.get("page", "Unknown")
        title = doc.metadata.get("document_title", "Document")
        evidence.append({
            "source_index":   i,
            "document_title": title,
            "page":           page,
            "chunk_index":    doc.metadata.get("chunk_index"),
            "citation":       f"{title} (Page {page})",
            "excerpt":        doc.page_content[:320].strip(),
        })
    return evidence


def _extract_unique_document_ids(docs):
    ids = []
    for doc in docs:
        did = doc.metadata.get("document_id")
        if did:
            ids.append(str(did))
    return sorted(set(ids))


# ============================================================================
# 1. INGESTION ENGINE
# ============================================================================
def ingest_document(doc_id):
    BATCH_SIZE  = int(os.environ.get("EMBEDDING_BATCH_SIZE",            "32"))
    BATCH_DELAY = float(os.environ.get("EMBEDDING_BATCH_DELAY_SECONDS", "1.5"))

    try:
        doc       = Document.objects.get(id=doc_id)
        file_path = doc.file.path
        logger.info("Starting ingestion for: %s", doc.title)

        doc.processed        = False
        doc.status           = Document.Status.INDEXING
        doc.progress_percent = 0
        doc.total_chunks     = 0
        doc.processed_chunks = 0
        doc.last_error       = ""
        doc.save(update_fields=[
            "processed", "status", "progress_percent",
            "total_chunks", "processed_chunks", "last_error",
        ])

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found at {file_path}")

        # ── Smart text extraction ──────────────────────────────────────────
        # PyPDF first — if pages have real text, use it directly.
        # If pages are mostly empty (scanned/aged document), switch to
        # Cloud Vision OCR which handles mixed-language, handwritten,
        # and low-quality scans common in APAC clinical records.
        from ai_engine.ocr_utils import extract_text_from_pdf

        loader   = PyPDFLoader(file_path)
        raw_docs = loader.load()

        extracted = extract_text_from_pdf(file_path, raw_docs)
        if not extracted:
            raise ValueError(
                "Text extraction returned no content — "
                "file may be corrupted or an unsupported format"
            )

        # Log extraction method so we can track OCR usage in monitoring
        sources     = set(p['source'] for p in extracted)
        avg_conf    = sum(p['confidence'] for p in extracted) / len(extracted)
        used_ocr    = 'vision_ocr' in sources
        logger.info(
            "Extracted %d pages via %s (avg confidence: %.2f)%s",
            len(extracted),
            '/'.join(sorted(sources)),
            avg_conf,
            " — OCR used for scanned document" if used_ocr else "",
        )

        # Convert extracted pages back to LangChain Document format
        # so the rest of the pipeline (chunking, embedding) is unchanged
        from langchain_core.documents import Document as LCDocument
        lc_docs = [
            LCDocument(
                page_content=p['text'],
                metadata={
                    'page':            p['page_number'],
                    'source':          file_path,
                    'extraction':      p['source'],
                    'ocr_confidence':  p.get('confidence', 1.0),
                }
            )
            for p in extracted
            if p['text'].strip()
        ]
        if not lc_docs:
            raise ValueError("All pages were empty after extraction")

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, chunk_overlap=200, length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        chunks = splitter.split_documents(lc_docs)
        logger.info("Split into %d chunks", len(chunks))
        doc.total_chunks = len(chunks)
        doc.save(update_fields=["total_chunks"])

        for i, chunk in enumerate(chunks):
            chunk.metadata["user_id"]        = str(doc.user.id) if doc.user else "public"
            chunk.metadata["document_id"]    = str(doc.id)
            chunk.metadata["document_title"] = doc.title
            chunk.metadata["chunk_index"]    = i

        embedding_model = get_embedding_model()
        total_batches   = (len(chunks) + BATCH_SIZE - 1) // BATCH_SIZE

        for batch_idx in range(total_batches):
            start = batch_idx * BATCH_SIZE
            end   = min(start + BATCH_SIZE, len(chunks))
            batch = chunks[start:end]
            logger.info("Embedding batch %d/%d", batch_idx + 1, total_batches)

            for attempt in range(3):
                try:
                    PGVector.from_documents(
                        embedding=embedding_model,
                        documents=batch,
                        collection_name=COLLECTION_NAME,
                        connection_string=CONNECTION_STRING,
                        pre_delete_collection=False,
                    )
                    doc.processed_chunks  = min(end, len(chunks))
                    doc.progress_percent  = int((doc.processed_chunks / len(chunks)) * 100)
                    doc.save(update_fields=["processed_chunks", "progress_percent"])
                    break
                except Exception as e:
                    if ("429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)) and attempt < 2:
                        wait = BATCH_DELAY * (attempt + 1)
                        logger.warning("Rate limited — waiting %.1fs", wait)
                        time.sleep(wait)
                    else:
                        raise

            if batch_idx < total_batches - 1 and BATCH_DELAY > 0:
                time.sleep(BATCH_DELAY)

        doc.processed        = True
        doc.status           = Document.Status.INDEXED
        doc.progress_percent = 100
        doc.processed_chunks = len(chunks)
        doc.last_error       = ""
        doc.save(update_fields=[
            "processed", "status", "progress_percent", "processed_chunks", "last_error",
        ])
        DOCUMENTS_INGESTED.inc()
        logger.info("'%s' indexed — %d vectors", doc.title, len(chunks))
        return {"status": "success", "document_id": doc.id, "chunks_created": len(chunks)}

    except Document.DoesNotExist:
        logger.error("Document %s not found", doc_id)
        return {"status": "error", "message": f"Document {doc_id} not found"}
    except Exception as e:
        logger.error("Ingestion failed for doc %s: %s", doc_id, e)
        Document.objects.filter(id=doc_id).update(
            processed=False, status=Document.Status.FAILED, last_error=str(e)
        )
        return {"status": "error", "message": str(e)}


# ============================================================================
# 2. LLM ROUTER — Gemini 1.5 Flash (primary) -> Groq Llama-3 (fallback)
# ============================================================================
def call_gemini(prompt, _retries=2):
    """Primary LLM: Gemini 1.5 Flash in JSON mode."""
    with trace_context("rag.provider.gemini.generate",
                       {"gen_ai.system": "google", "gen_ai.request.model": GEMINI_MODEL}):
        api_key = get_google_api_key()
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not available")

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                response_mime_type="application/json",
            ),
            safety_settings={
                HarmCategory.HARM_CATEGORY_HATE_SPEECH:       HarmBlockThreshold.BLOCK_ONLY_HIGH,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
        )

        for attempt in range(_retries + 1):
            try:
                add_span_attributes({"rag.provider.attempt": attempt + 1})
                response = model.generate_content(prompt)
                record_event("rag.provider.success", {"rag.provider": "gemini"})
                return response.text
            except Exception as e:
                record_event("rag.provider.error", {"rag.provider": "gemini", "error.message": str(e)})
                if ("429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)) and attempt < _retries:
                    wait = 5 * (attempt + 1)
                    logger.warning("Gemini rate limited — retry in %ds (%d/%d)", wait, attempt + 1, _retries)
                    time.sleep(wait)
                else:
                    raise


def call_groq_llama(prompt):
    """Fallback LLM: Groq Llama-3.3-70B (OpenAI-compatible endpoint)."""
    with trace_context("rag.provider.groq.generate",
                       {"gen_ai.system": "groq", "gen_ai.request.model": "llama-3.3-70b-versatile"}):
        groq_key = get_groq_api_key()
        if not groq_key:
            raise ValueError("GROQ_API_KEY not available")

        client   = OpenAI(api_key=groq_key, base_url="https://api.groq.com/openai/v1")
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are VeriRAG, a strictly faithful AI Librarian. Always output valid JSON."},
                {"role": "user",   "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        record_event("rag.provider.success", {"rag.provider": "groq"})
        return response.choices[0].message.content


def call_llm_with_fallback(prompt):
    with trace_context("rag.provider.router", {"rag.provider.primary": "gemini"}):
        try:
            ACTIVE_MODEL.set(1)
            response = call_gemini(prompt)
            add_span_attributes({"rag.provider.selected": "gemini"})
            return response, "gemini"
        except Exception as primary_error:
            LLM_FALLBACKS.inc()
            ACTIVE_MODEL.set(2)
            logger.warning("Gemini failed: %s — switching to Groq/Llama-3", primary_error)
            record_event("rag.provider.failover", {
                "rag.provider.from": "gemini", "rag.provider.to": "groq",
                "error.message": str(primary_error),
            })
            try:
                response = call_groq_llama(prompt)
                return response, "groq"
            except Exception as backup_error:
                logger.error("Both LLMs failed. Gemini: %s  Groq: %s", primary_error, backup_error)
                return json.dumps({
                    "answer": "System Notice: All AI providers are currently unavailable. Please try again later.",
                    "faithfulness_score": 0.0,
                    "explanation": "Both Gemini and Groq failed.",
                    "source_citation": "System Error",
                    "verification_passed": False,
                }), "error"


# ============================================================================
# 3. VERIFICATION ENGINE
# ============================================================================
def verify_faithfulness(answer, context, query):
    """Semantic cosine similarity using Google embeddings. Falls back to word-overlap."""
    with trace_context("rag.verification.semantic", {
        "rag.query.length":   len(query   or ""),
        "rag.answer.length":  len(answer  or ""),
        "rag.context.length": len(context or ""),
    }):
        if not answer or not context:
            return 0.5, "Answer or context is empty"
        try:
            em               = get_embedding_model()
            answer_emb       = em.embed_query(answer)
            context_emb      = em.embed_query(context)
            from sklearn.metrics.pairwise import cosine_similarity
            score = float(cosine_similarity([answer_emb], [context_emb])[0][0])
            score = max(0.0, min(1.0, score))
            add_span_attributes({"rag.verification.score": round(score, 4)})
            return score, f"Semantic similarity: {score:.2%}"
        except Exception as e:
            logger.error("Semantic verification failed, heuristic fallback: %s", e)
            answer_words  = set(re.findall(r'\b\w{4,}\b', answer.lower()))
            context_words = set(re.findall(r'\b\w{4,}\b', context.lower()))
            if not answer_words:
                return 0.5, "Unable to extract key terms"
            overlap = answer_words & context_words
            coverage = len(overlap) / len(answer_words)
            penalty  = min(len(answer_words - context_words) * 0.05, 0.3)
            score    = max(0.0, min(1.0, coverage - penalty + 0.3))
            return score, f"Heuristic fallback — overlap {len(overlap)}/{len(answer_words)}"


def evaluate_with_ragas(query, answer, contexts, ground_truth=None):
    try:
        from ragas import evaluate
        from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
        from datasets import Dataset

        context_texts = [c.page_content if hasattr(c, "page_content") else str(c) for c in contexts]
        data    = {"question": [query], "answer": [answer], "contexts": [context_texts]}
        metrics = [faithfulness, answer_relevancy, context_precision]
        if ground_truth:
            data["ground_truth"] = [ground_truth]
            metrics.append(context_recall)

        result = evaluate(Dataset.from_dict(data), metrics=metrics)
        scores = {
            "faithfulness":      round(float(result.get("faithfulness",      0.5)), 3),
            "answer_relevancy":  round(float(result.get("answer_relevancy",  0.5)), 3),
            "context_precision": round(float(result.get("context_precision", 0.5)), 3),
            "context_recall":    round(float(result.get("context_recall",    0.0)), 3) if ground_truth else 0.0,
        }
        scores["combined_score"] = round(
            scores["faithfulness"] * 0.5 + scores["answer_relevancy"] * 0.3 + scores["context_precision"] * 0.2, 3
        )
        FAITHFULNESS_HISTOGRAM.observe(scores["faithfulness"])
        return scores
    except ImportError as e:
        logger.warning("RAGAS not available (%s)", e)
        fallback_score, _ = verify_faithfulness(
            answer,
            "\n".join(c.page_content if hasattr(c, "page_content") else str(c) for c in contexts),
            query,
        )
        return {"faithfulness": fallback_score, "answer_relevancy": 0.5,
                "context_precision": 0.5, "context_recall": 0.0, "combined_score": fallback_score}
    except Exception as e:
        logger.error("RAGAS evaluation failed: %s", e)
        return {"faithfulness": 0.5, "answer_relevancy": 0.5,
                "context_precision": 0.5, "context_recall": 0.0, "combined_score": 0.5}


# ============================================================================
# 4. MAIN PIPELINE
# ============================================================================
def get_verified_answer(query, user_id, request_context=None):
    QUERIES_TOTAL.inc()
    request_context = request_context or {}
    query_id = request_context.get("query_id")

    with trace_context("rag.query.pipeline", {
        "enduser.id": user_id, "rag.query.id": query_id, "rag.query.length": len(query or ""),
    }):
        try:
            with trace_context("rag.retrieval.vector_search",
                               {"db.system": "postgresql+pgvector", "rag.retrieval.top_k": 5}):
                vector_db = get_vector_store()
                docs = vector_db.similarity_search(query, k=5, filter={"user_id": str(user_id)})
                add_span_attributes({"rag.retrieval.result_count": len(docs)})
                record_event("rag.retrieval.completed", {"rag.retrieval.result_count": len(docs)})

            if not docs:
                return {
                    "answer": "I couldn't find any relevant information in your uploaded documents. "
                              "Please upload a document first or rephrase your question.",
                    "faithfulness_score": 0.0, "explanation": "No matching vectors found.",
                    "source_citation": "None", "evidence_items": [], "verification_passed": True,
                    "model_used": "none", "context_chunks_used": 0,
                    "evaluation": {"faithfulness": 0.0, "answer_relevancy": 0.0,
                                   "context_precision": 0.0, "context_recall": 0.0, "combined_score": 0.0},
                }

            context_parts  = []
            citations      = []
            evidence_items = _build_evidence_payload(docs)
            for i, doc in enumerate(docs):
                page  = doc.metadata.get("page", "Unknown")
                title = doc.metadata.get("document_title", "Document")
                # Use actual page_content — not file path — for clinical context
                context_parts.append(f"[Source {i+1}: {title}, Page {page}]\n{doc.page_content}")
                citations.append(f"{title} (Page {page})")
            context         = "\n\n---\n\n".join(context_parts)
            source_citation = "; ".join(set(citations))

            generation_prompt = f"""You are VeriRAG, a strictly faithful AI Librarian. \
Answer ONLY using the context provided below.

RULES:
1. Use ONLY information explicitly stated in the context.
2. If the context lacks the answer, say "The provided documents don't contain information about this."
3. Never fabricate facts, names, dates, or statistics.
4. Quote directly from the context where possible.

CONTEXT:
{context}

QUESTION: {query}

Respond with EXACTLY this JSON (no markdown fences):
{{
    "answer": "<factual answer from context only>",
    "faithfulness_score": <float 0.0-1.0>,
    "explanation": "<where in the context the answer comes from>",
    "source_citation": "<direct quote or page reference>"
}}"""

            with trace_context("rag.generation.response", {"rag.context.chunk_count": len(docs)}):
                response_text, model_used = call_llm_with_fallback(generation_prompt)
                add_span_attributes({"rag.response.model_used": model_used})

            try:
                clean = response_text.strip()
                clean = re.sub(r'^```(?:json)?\s*', '', clean)
                clean = re.sub(r'\s*```$', '', clean)
                response_data = json.loads(clean)
            except json.JSONDecodeError as e:
                logger.error("JSON parse error: %s | raw: %s", e, response_text[:500])
                return {
                    "answer": "Error parsing AI response. Please try again.",
                    "faithfulness_score": 0.0, "explanation": str(e),
                    "source_citation": source_citation, "evidence_items": evidence_items,
                    "verification_passed": False, "model_used": model_used,
                    "context_chunks_used": len(docs),
                    "evaluation": {"faithfulness": 0.0, "answer_relevancy": 0.0,
                                   "context_precision": 0.0, "context_recall": 0.0, "combined_score": 0.0},
                }

            answer         = response_data.get("answer", "")
            initial_score  = float(response_data.get("faithfulness_score", 0.0) or 0.0)
            sem_score, _   = verify_faithfulness(answer, context, query)
            combined_score = initial_score * 0.6 + sem_score * 0.4
            FAITHFULNESS_HISTOGRAM.observe(combined_score)
            verification_passed = combined_score >= FAITHFULNESS_THRESHOLD

            if not verification_passed:
                VERIFICATION_REJECTIONS.inc()
                logger.warning("Low faithfulness (%.2f) — Groq strict regeneration", combined_score)
                strict_prompt = f"""CRITICAL: Previous response failed faithfulness verification. Be MORE conservative.

CONTEXT:
{context}

QUESTION: {query}

RULES: State ONLY facts directly quoted in the context. If unsure, say you cannot answer.

JSON Response:
{{
    "answer": "<conservative, directly-quoted answer>",
    "faithfulness_score": <float 0.0-1.0>,
    "explanation": "<verification explanation>",
    "source_citation": "<direct quote>"
}}"""
                try:
                    with trace_context("rag.verification.regeneration", {"rag.provider": "groq"}):
                        strict_response = call_groq_llama(strict_prompt)
                        response_data   = json.loads(strict_response)
                        model_used      = "groq_verification"
                        LLM_FALLBACKS.inc()
                except Exception as e:
                    logger.error("Strict regeneration failed: %s", e)

            answer       = response_data.get("answer", "Unable to generate response")
            ragas_scores = evaluate_with_ragas(query=query, answer=answer, contexts=docs)

            record_event("rag.response.ready", {
                "rag.response.model_used":          model_used,
                "rag.context.chunk_count":          len(docs),
                "rag.response.verification_passed": verification_passed,
                "rag.evaluation.faithfulness":      ragas_scores.get("faithfulness", 0.5),
            })

            return {
                "answer":              answer,
                "faithfulness_score":  round(combined_score, 2),
                "explanation":         response_data.get("explanation", ""),
                "source_citation":     response_data.get("source_citation", source_citation),
                "evidence_items":      evidence_items,
                "verification_passed": verification_passed,
                "model_used":          model_used,
                "context_chunks_used": len(docs),
                "evaluation":          ragas_scores,
            }

        except Exception as e:
            logger.error("Verification engine error: %s", e)
            return {
                "answer": "An internal error occurred while processing your question.",
                "faithfulness_score": 0.0, "explanation": str(e),
                "source_citation": "System Error", "evidence_items": [],
                "verification_passed": False, "model_used": "none", "context_chunks_used": 0,
                "evaluation": {"faithfulness": 0.0, "answer_relevancy": 0.0,
                               "context_precision": 0.0, "context_recall": 0.0, "combined_score": 0.0},
            }
