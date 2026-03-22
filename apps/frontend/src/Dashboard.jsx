import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth, isDemoUser } from './lib/auth'
import api from './lib/api'
import {
  UploadCloud, FileText, ShieldCheck, AlertTriangle, Activity,
  CheckCircle2, Loader2, Send, ShieldAlert, BookOpen, User,
  Zap, RefreshCw, X, ChevronDown,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// ── Faithfulness score badge ─────────────────────────────────────────────────
function FaithfulnessBadge({ score, regenerated }) {
  if (regenerated || score < 0.6) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: 'rgba(251,146,60,0.15)', color: '#f97316',
        border: '1px solid rgba(251,146,60,0.3)',
      }}>
        <ShieldAlert size={11} /> Safety fallback — score {(score * 100).toFixed(0)}%
      </span>
    )
  }
  const color = score >= 0.85 ? '#22c55e' : '#3b82f6'
  const bg    = score >= 0.85 ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)'
  const border= score >= 0.85 ? 'rgba(34,197,94,0.3)'  : 'rgba(59,130,246,0.3)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: bg, color, border: `1px solid ${border}`,
    }}>
      <CheckCircle2 size={11} /> Verified — {(score * 100).toFixed(0)}%
    </span>
  )
}

// ── Score bar for inline display ──────────────────────────────────────────────
function ScoreBar({ score }) {
  const pct   = Math.round(score * 100)
  const color = score >= 0.85 ? '#22c55e' : score >= 0.6 ? '#3b82f6' : '#f97316'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, minWidth: 32 }}>{pct}%</span>
    </div>
  )
}

// ── Upload stage indicator ────────────────────────────────────────────────────
const UPLOAD_STAGES = [
  { key: 'uploading',    label: 'Uploading PDF',          sub: 'Encrypted transfer' },
  { key: 'processing',   label: 'Celery extraction',       sub: 'PyPDF text parsing' },
  { key: 'vectorizing',  label: 'Generating embeddings',   sub: 'text-embedding-004 · 768-dim' },
  { key: 'indexed',      label: 'Indexed in pgvector',     sub: 'Ready for semantic search' },
]

function UploadProgress({ stage, progress }) {
  const stageIdx = UPLOAD_STAGES.findIndex(s => s.key === stage)
  return (
    <div style={{ width: '100%', maxWidth: 440 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>Indexing document…</span>
        <span style={{ fontSize: 12, color: '#22c55e', fontFamily: 'monospace' }}>{progress}%</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 20 }}>
        <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#22d3ee,#22c55e)', borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {UPLOAD_STAGES.map((s, i) => {
          const done    = i < stageIdx
          const active  = i === stageIdx
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#22c55e' : active ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.05)',
                border: active ? '1px solid rgba(34,211,238,0.5)' : '1px solid transparent',
              }}>
                {done  && <CheckCircle2 size={14} color="#fff" />}
                {active && <Loader2 size={14} color="#22d3ee" style={{ animation: 'spin 1s linear infinite' }} />}
                {!done && !active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: done ? '#22c55e' : active ? '#e2e8f0' : '#475569' }}>{s.label}</div>
                <div style={{ fontSize: 11, color: '#334155' }}>{s.sub}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Suggested clinical questions ──────────────────────────────────────────────
const DEMO_QUESTIONS = [
  "What allergies does the patient have?",
  "What medications is the patient currently taking?",
  "What were the key lab findings?",
  "What is the patient's diagnosis and recommended treatment?",
]

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth()
  const [activeTab,    setActiveTab]    = useState('query')
  const [chatHistory,  setChatHistory]  = useState([{
    role: 'assistant',
    content: 'Welcome to MediRAG. I am your verified clinical intelligence assistant. My responses are fact-checked against your uploaded records using the Dual-Agent Verification Pipeline.\n\nUpload a patient PDF or click a suggested question to begin.',
    score: 1.0,
    citations: [],
    model_used: 'system',
  }])
  const [inputValue,  setInputValue]   = useState('')
  const [isQuerying,  setIsQuerying]   = useState(false)
  const [queryError,  setQueryError]   = useState('')
  const messagesEndRef = useRef(null)

  // Upload state
  const [uploadStage,   setUploadStage]   = useState('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError,    setUploadError]    = useState('')
  const [documents,      setDocuments]      = useState([])
  const fileInputRef = useRef(null)

  // Analytics state — driven by actual query results
  const [queryLog, setQueryLog] = useState([])

  // faithfulness chart data — rolling last 7 entries
  const faithfulnessData = queryLog.slice(-7).map((q, i) => ({
    day: `Q${i + 1}`,
    score: Math.round((q.score || 0) * 100),
  }))

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isQuerying])

  // Load documents on mount
  useEffect(() => {
    fetchDocuments()
  }, [])

  async function fetchDocuments() {
    try {
      const { data } = await api.get('/api/documents/')
      setDocuments(Array.isArray(data) ? data : data.results || [])
    } catch {
      // ignore on demo mode if docs endpoint not seeded yet
    }
  }

  // ── Chat ────────────────────────────────────────────────────────────────────
  async function handleSendMessage(e, overrideQuery) {
    if (e) e.preventDefault()
    const query = overrideQuery || inputValue
    if (!query.trim() || isQuerying) return

    const userMsg = { role: 'user', content: query }
    setChatHistory(prev => [...prev, userMsg])
    setInputValue('')
    setIsQuerying(true)
    setQueryError('')

    try {
      const { data } = await api.post('/api/query/', { query })

      const assistantMsg = {
        role:          'assistant',
        content:       data.answer || 'No answer returned.',
        score:         data.faithfulness_score ?? 0,
        regenerated:   data.model_used?.includes('groq') || data.model_used?.includes('fallback'),
        model_used:    data.model_used || 'gemini',
        citations:     (data.evidence_items || []).map(e => e.citation || e.document_title),
        latency_ms:    data.latency_ms,
        context_count: data.context_chunks_used,
        evaluation:    data.evaluation,
      }
      setChatHistory(prev => [...prev, assistantMsg])

      // Log for analytics
      setQueryLog(prev => [...prev, {
        query,
        score:             data.faithfulness_score ?? 0,
        passed:            data.verification_passed,
        model:             data.model_used,
        evidence_count:    (data.evidence_items || []).length,
        context_chunks:    data.context_chunks_used,
      }])

    } catch (err) {
      const detail = err.response?.data?.error || err.message || 'Request failed'
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `Could not process query: ${detail}`,
        score: 0,
        citations: [],
        error: true,
      }])
      setQueryError(detail)
    } finally {
      setIsQuerying(false)
    }
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  async function handleFileUpload(file) {
    if (!file || !file.name.endsWith('.pdf')) {
      setUploadError('Only PDF files are supported.')
      return
    }
    setUploadStage('uploading')
    setUploadProgress(10)
    setUploadError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', file.name.replace('.pdf', ''))

    try {
      const { data } = await api.post('/api/documents/', formData)
      setUploadProgress(30)
      setUploadStage('processing')

      // Poll for indexing progress
      const docId = data.id
      let attempts = 0
      const maxAttempts = 40
      const poll = setInterval(async () => {
        attempts++
        try {
          const { data: doc } = await api.get(`/api/documents/${docId}/`)
          const pct = doc.progress_percent || 0
          setUploadProgress(Math.max(30, pct))
          if (pct > 30) setUploadStage('vectorizing')
          if (doc.status === 'indexed' || doc.processed) {
            clearInterval(poll)
            setUploadProgress(100)
            setUploadStage('indexed')
            fetchDocuments()
            setTimeout(() => setUploadStage('idle'), 3000)
          } else if (doc.status === 'failed') {
            clearInterval(poll)
            setUploadError(doc.last_error || 'Indexing failed.')
            setUploadStage('idle')
          }
        } catch { clearInterval(poll) }
        if (attempts >= maxAttempts) {
          clearInterval(poll)
          setUploadStage('idle')
        }
      }, 2000)
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed. Check file size and format.')
      setUploadStage('idle')
    }
  }

  const handleDragDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFileUpload(file)
  }, [])

  // ── Stats for analytics tab ─────────────────────────────────────────────────
  const totalQueries       = queryLog.length
  const avgScore           = totalQueries ? queryLog.reduce((a, b) => a + b.score, 0) / totalQueries : 0
  const verifiedCount      = queryLog.filter(q => q.passed).length
  const hallucinations     = queryLog.filter(q => !q.passed).length
  const verificationRate   = totalQueries ? (verifiedCount / totalQueries) * 100 : 0

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#040207', color: '#e2e8f0' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        .dot-bounce { animation: bounce 1s ease-in-out infinite; }
        .tab-btn { padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
                   border: none; cursor: pointer; transition: all 0.15s; }
        .tab-btn.active  { background: rgba(34,211,238,0.15); color: #22d3ee; border: 1px solid rgba(34,211,238,0.3); }
        .tab-btn.inactive{ background: transparent; color: #475569; border: 1px solid transparent; }
        .tab-btn.inactive:hover { color: #94a3b8; }
        .chat-input:focus { outline: none; border-color: rgba(34,211,238,0.4) !important; box-shadow: 0 0 0 3px rgba(34,211,238,0.08); }
      `}</style>

      {/* Header */}
      <header style={{
        background: 'rgba(4,2,7,0.9)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 50,
        padding: '0 24px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 10, padding: 8 }}>
            <ShieldCheck size={18} color="#67e8f9" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>MediRAG</div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.2em', color: '#334155', textTransform: 'uppercase' }}>Clinical Intelligence</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {isDemoUser() && (
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(234,179,8,0.12)', color: '#eab308', border: '1px solid rgba(234,179,8,0.2)', fontWeight: 600 }}>
              Demo mode
            </span>
          )}
          <span style={{ fontSize: 13, color: '#475569' }}>
            Dr. {user?.email?.split('@')[0] || 'Clinician'}
          </span>
          <button onClick={logout} style={{ fontSize: 12, color: '#475569', background: 'none', border: 'none', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {[
            { key: 'query',     label: 'Clinical Agent' },
            { key: 'documents', label: 'Patient Records' },
            { key: 'analytics', label: 'Analytics' },
          ].map(t => (
            <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : 'inactive'}`}
              onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Clinical Agent Tab ─────────────────────────────────────────────── */}
        {activeTab === 'query' && (
          <div style={{
            display: 'flex', flexDirection: 'column', height: 680,
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            {/* Chat header */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(34,211,238,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck size={20} color="#22d3ee" />
                  </div>
                  <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, background: '#22c55e', borderRadius: '50%', border: '2px solid #040207' }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>MediRAG Verifier</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>Dual-Agent Pipeline Active</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(34,211,238,0.1)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)', fontWeight: 600 }}>
                  Gemini 1.5 Flash — Primary
                </span>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(251,146,60,0.08)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.2)', fontWeight: 600 }}>
                  Groq Llama-3 — Fallback
                </span>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(0,0,0,0.15)' }}>
              {chatHistory.map((msg, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: 10 }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 32, height: 32, background: msg.error ? '#7f1d1d' : 'rgba(34,211,238,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <ShieldCheck size={16} color={msg.error ? '#f87171' : '#22d3ee'} />
                    </div>
                  )}
                  <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{
                      padding: '12px 16px', fontSize: 14, lineHeight: 1.65,
                      borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      background: msg.role === 'user'
                        ? 'linear-gradient(135deg, #0ea5e9, #0284c7)'
                        : msg.error
                          ? 'rgba(239,68,68,0.08)'
                          : 'rgba(255,255,255,0.05)',
                      border: msg.role === 'assistant' ? `1px solid ${msg.error ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)'}` : 'none',
                      color: '#e2e8f0',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>

                    {/* Faithfulness footer */}
                    {msg.role === 'assistant' && msg.model_used !== 'system' && !msg.error && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <FaithfulnessBadge score={msg.score} regenerated={msg.regenerated} />
                        {msg.latency_ms && (
                          <span style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace' }}>
                            {msg.latency_ms}ms · {msg.context_count || 0} chunks
                          </span>
                        )}
                        {msg.citations?.filter(Boolean).map((cite, i) => (
                          <button key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                            background: 'rgba(255,255,255,0.04)', color: '#64748b',
                            border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                          }}>
                            <BookOpen size={10} /> {cite}
                          </button>
                        ))}
                      </div>
                    )}
                    {msg.role === 'assistant' && msg.score > 0 && msg.model_used !== 'system' && (
                      <ScoreBar score={msg.score} />
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.06)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <User size={15} color="#64748b" />
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isQuerying && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, background: 'rgba(34,211,238,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={16} color="#22d3ee" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                  <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '4px 16px 16px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {[0, 150, 300].map((delay, i) => (
                      <div key={i} className="dot-bounce" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d3ee', opacity: 0.6, animationDelay: `${delay}ms` }} />
                    ))}
                    <span style={{ fontSize: 11, color: '#475569', marginLeft: 4 }}>Running dual-agent verification…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested questions */}
            {chatHistory.length <= 2 && (
              <div style={{ padding: '8px 20px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 6, flexWrap: 'wrap', background: 'rgba(0,0,0,0.1)' }}>
                {DEMO_QUESTIONS.map((q, i) => (
                  <button key={i} onClick={() => handleSendMessage(null, q)} style={{
                    fontSize: 11, padding: '4px 12px', borderRadius: 20,
                    background: 'rgba(255,255,255,0.04)', color: '#64748b',
                    border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer',
                  }}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <form onSubmit={handleSendMessage} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  className="chat-input"
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="Ask a clinical question about the patient records…"
                  disabled={isQuerying}
                  style={{
                    width: '100%', padding: '13px 52px 13px 18px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12, color: '#e2e8f0', fontSize: 14,
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                />
                <button type="submit" disabled={!inputValue.trim() || isQuerying} style={{
                  position: 'absolute', right: 8,
                  padding: '7px', borderRadius: 8, border: 'none',
                  background: !inputValue.trim() || isQuerying ? 'rgba(255,255,255,0.06)' : '#0ea5e9',
                  cursor: !inputValue.trim() || isQuerying ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Send size={16} color={!inputValue.trim() || isQuerying ? '#334155' : '#fff'} />
                </button>
              </form>
              <p style={{ fontSize: 10, color: '#1e293b', textAlign: 'center', marginTop: 8 }}>
                Responses are fact-checked by the Critic Agent · faithfulness threshold 0.6 · Groq fallback on rejection
              </p>
            </div>
          </div>
        )}

        {/* ── Patient Records Tab ────────────────────────────────────────────── */}
        {activeTab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Drop zone */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDragDrop}
              style={{
                border: `2px dashed ${uploadStage !== 'idle' ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 16, padding: '48px 24px',
                background: uploadStage !== 'idle' ? 'rgba(34,211,238,0.03)' : 'rgba(255,255,255,0.015)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s',
              }}
            >
              {uploadStage === 'idle' ? (
                <>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,211,238,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <UploadCloud size={28} color="#22d3ee" />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Upload patient records</h3>
                  <p style={{ fontSize: 13, color: '#475569', textAlign: 'center', maxWidth: 400, marginBottom: 20 }}>
                    Drop a PDF here or click Browse. Documents are encrypted and chunked into 768-dim vectors for semantic search.
                  </p>
                  {uploadError && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{uploadError}</p>}
                  <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                  <button onClick={() => fileInputRef.current?.click()} style={{
                    padding: '10px 24px', background: '#0ea5e9', border: 'none', borderRadius: 10,
                    color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  }}>
                    Browse files
                  </button>
                </>
              ) : (
                <UploadProgress stage={uploadStage} progress={uploadProgress} />
              )}
            </div>

            {/* Document list */}
            {documents.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  Indexed records ({documents.length})
                </h4>
                {documents.map(doc => (
                  <div key={doc.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileText size={16} color="#475569" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>{doc.title}</div>
                        <div style={{ fontSize: 11, color: '#334155' }}>
                          {doc.total_chunks || 0} chunks · {doc.progress_percent || 0}% indexed
                        </div>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                      background: doc.status === 'indexed' ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                      color: doc.status === 'indexed' ? '#22c55e' : '#eab308',
                    }}>
                      {doc.status || (doc.processed ? 'indexed' : 'processing')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Analytics Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16 }}>
              {[
                { label: 'Indexed records',     value: documents.length,                   color: '#22d3ee' },
                { label: 'Avg faithfulness',     value: `${(avgScore * 100).toFixed(1)}%`, color: '#22c55e' },
                { label: 'Verification rate',    value: `${verificationRate.toFixed(0)}%`, color: '#3b82f6' },
                { label: 'Hallucinations blocked', value: hallucinations,                   color: '#f97316' },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  padding: '20px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{kpi.label}</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Faithfulness trend chart */}
            <div style={{ padding: '20px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 20 }}>
                Dual-Agent Verification Trend
                {totalQueries === 0 && <span style={{ fontSize: 12, color: '#334155', fontWeight: 400, marginLeft: 8 }}>(start asking questions to see live data)</span>}
              </h3>
              {faithfulnessData.length > 0 ? (
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={faithfulnessData}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11 }} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                        itemStyle={{ color: '#22d3ee', fontWeight: 600 }}
                        formatter={(v) => [`${v}%`, 'Faithfulness']}
                      />
                      <Area type="monotone" dataKey="score" stroke="#22d3ee" strokeWidth={2} fillOpacity={1} fill="url(#scoreGrad)" dot={{ fill: '#22d3ee', r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontSize: 13 }}>
                  No queries yet — run a clinical question to populate this chart
                </div>
              )}
            </div>

            {/* Query history table */}
            {queryLog.length > 0 && (
              <div style={{ padding: '20px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 16 }}>Recent verifications</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Query', 'Score', 'Status', 'Model', 'Evidence'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 12px', color: '#334155', fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryLog.slice(-10).reverse().map((q, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px 12px', color: '#94a3b8', maxWidth: 280 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</div>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                <div style={{ width: `${q.score * 100}%`, height: '100%', background: q.score >= 0.6 ? '#22c55e' : '#f97316', borderRadius: 2 }} />
                              </div>
                              <span style={{ color: q.score >= 0.6 ? '#22c55e' : '#f97316', fontWeight: 600 }}>{(q.score * 100).toFixed(0)}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                              background: q.passed ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)',
                              color: q.passed ? '#22c55e' : '#f97316' }}>
                              {q.passed ? 'Verified' : 'Fallback'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', color: '#475569', fontFamily: 'monospace', fontSize: 11 }}>{q.model}</td>
                          <td style={{ padding: '8px 12px', color: '#475569' }}>{q.evidence_count} refs</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
