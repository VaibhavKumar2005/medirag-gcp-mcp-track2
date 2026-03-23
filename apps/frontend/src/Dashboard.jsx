import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth, isDemoUser } from './lib/auth'
import api from './lib/api'
import PipelineVisualizer from './PipelineVisualizer'
import ADKAgentPanel from './ADKAgentPanel'
import {
  UploadCloud, FileText, ShieldCheck, AlertTriangle,
  CheckCircle2, Loader2, Send, ShieldAlert, BookOpen, User,
  Zap, Clock,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const GUIDED_DEMO = [
  { label: 'High confidence', query: 'What allergies does the patient have?',            hint: 'Expect: Critic passes · score > 0.85' },
  { label: 'Fallback trigger', query: 'What is the long-term cardiovascular prognosis?',  hint: 'Expect: Score < 0.6 · Groq regeneration' },
  { label: 'Refusal case',    query: "What was the patient's childhood vaccination history?", hint: "Expect: 'Cannot answer from available records'" },
]

const PIPELINE_STAGES = ['retrieving','generating','verifying','gating','done']
const STAGE_DELAYS    = [0, 900, 1800, 2600, 0]

function FaithfulnessBadge({ score, regenerated }) {
  const pct = Math.round((score ?? 0) * 100)
  if (regenerated || pct < 60) return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background:'rgba(251,146,60,.12)', color:'#f97316', border:'1px solid rgba(251,146,60,.25)' }}>
      <ShieldAlert size={10} /> Safety fallback — {pct}%
    </span>
  )
  const color = pct >= 85 ? '#22c55e' : '#3b82f6'
  const bg    = pct >= 85 ? 'rgba(34,197,94,.1)' : 'rgba(59,130,246,.1)'
  const brd   = pct >= 85 ? 'rgba(34,197,94,.25)' : 'rgba(59,130,246,.25)'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background:bg, color, border:`1px solid ${brd}` }}>
      <CheckCircle2 size={10} /> Verified — {pct}%
    </span>
  )
}

function ScoreBar({ score }) {
  const pct   = Math.round((score ?? 0) * 100)
  const color = pct >= 85 ? '#22c55e' : pct >= 60 ? '#3b82f6' : '#f97316'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
      <div style={{ flex:1, height:3, background:'rgba(255,255,255,.07)', borderRadius:2 }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:2, transition:'width .6s ease' }} />
      </div>
      <span style={{ fontSize:10, fontWeight:700, color, fontFamily:'monospace', minWidth:28 }}>{pct}%</span>
    </div>
  )
}

const UPLOAD_META = [
  { key:'uploading',   label:'Uploading PDF',        sub:'Encrypted transfer' },
  { key:'processing',  label:'Celery extraction',     sub:'PyPDF text parsing' },
  { key:'vectorizing', label:'Generating embeddings', sub:'text-embedding-004 · 768d' },
  { key:'indexed',     label:'Indexed in pgvector',   sub:'Ready for semantic search' },
]

function UploadProgress({ stage, progress }) {
  const si = UPLOAD_META.findIndex(s => s.key === stage)
  return (
    <div style={{ width:'100%', maxWidth:420 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'#e2e8f0' }}>Indexing document…</span>
        <span style={{ fontSize:12, color:'#22c55e', fontFamily:'monospace' }}>{progress}%</span>
      </div>
      <div style={{ height:3, background:'rgba(255,255,255,.06)', borderRadius:2, marginBottom:20 }}>
        <div style={{ width:`${progress}%`, height:'100%', background:'linear-gradient(90deg,#22d3ee,#22c55e)', borderRadius:2, transition:'width .4s ease' }} />
      </div>
      {UPLOAD_META.map((s, i) => {
        const done = i < si, active = i === si
        return (
          <div key={s.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:done?'rgba(34,197,94,.15)':active?'rgba(34,211,238,.12)':'rgba(255,255,255,.04)', border:active?'1px solid rgba(34,211,238,.4)':'1px solid transparent' }}>
              {done  && <CheckCircle2 size={13} color="#22c55e" />}
              {active && <Loader2 size={13} color="#22d3ee" style={{ animation:'spin 1s linear infinite' }} />}
              {!done && !active && <div style={{ width:6, height:6, borderRadius:'50%', background:'rgba(255,255,255,.15)' }} />}
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:500, color:done?'#22c55e':active?'#e2e8f0':'#334155' }}>{s.label}</div>
              <div style={{ fontSize:10, color:'#1e293b', fontFamily:'monospace' }}>{s.sub}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const { user, logout }              = useAuth()
  const [activeTab, setActiveTab]     = useState('query')
  const [chatHistory, setChatHistory] = useState([{
    role:'assistant', score:1.0, citations:[], model_used:'system',
    content:"Welcome to MediRAG. I'm your verified clinical intelligence assistant.\n\nEvery response passes through the Dual-Agent Verification Pipeline — retrieved context → Gemini generates → Critic scores faithfulness → passes or Groq regenerates.\n\nTry the guided demo questions below to see all three pipeline states.",
  }])
  const [inputValue, setInputValue]   = useState('')
  const [isQuerying, setIsQuerying]   = useState(false)
  const [pipelineStage, setPipeline]  = useState('idle')
  const [lastResult, setLastResult]   = useState(null)
  const messagesEndRef                = useRef(null)
  const [uploadStage, setUploadStage] = useState('idle')
  const [uploadProgress, setUploadPct]= useState(0)
  const [uploadError, setUploadError] = useState('')
  const [documents, setDocuments]     = useState([])
  const fileInputRef                  = useRef(null)
  const [queryLog, setQueryLog]       = useState([])

  const faithData = queryLog.slice(-8).map((q, i) => ({ q:`Q${i+1}`, score:Math.round((q.score??0)*100) }))

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [chatHistory, isQuerying])
  useEffect(() => { fetchDocuments() }, [])

  async function fetchDocuments() {
    try {
      const { data } = await api.get('/api/documents/')
      setDocuments(Array.isArray(data) ? data : data.results ?? [])
    } catch {}
  }

  function animatePipeline(resolve) {
    let i = 0
    const run = () => {
      if (i >= PIPELINE_STAGES.length - 1) { resolve(); return }
      setPipeline(PIPELINE_STAGES[i])
      const delay = STAGE_DELAYS[i + 1] || 700
      i++
      setTimeout(run, delay)
    }
    run()
  }

  async function handleSendMessage(e, override) {
    if (e) e.preventDefault()
    const query = override || inputValue
    if (!query.trim() || isQuerying) return
    setChatHistory(prev => [...prev, { role:'user', content:query }])
    setInputValue('')
    setIsQuerying(true)
    setPipeline('retrieving')
    const pipelinePromise = new Promise(resolve => setTimeout(() => animatePipeline(resolve), 0))
    try {
      const { data } = await api.post('/api/query/', { query })
      await pipelinePromise
      const isFallback = data.model_used?.includes('groq') || !data.verification_passed
      setPipeline(isFallback ? 'fallback' : 'done')
      setLastResult(data)
      setChatHistory(prev => [...prev, {
        role:'assistant',
        content: data.answer || 'No answer returned.',
        score: data.faithfulness_score ?? 0,
        regenerated: isFallback,
        model_used: data.model_used || 'gemini',
        citations: (data.evidence_items ?? []).map(e => e.citation || e.document_title).filter(Boolean),
        latency_ms: data.latency_ms,
        context_count: data.context_chunks_used,
      }])
      setQueryLog(prev => [...prev, { query, score:data.faithfulness_score??0, passed:data.verification_passed, model:data.model_used, evidence_count:(data.evidence_items??[]).length }])
    } catch (err) {
      await pipelinePromise
      setPipeline('idle')
      setChatHistory(prev => [...prev, { role:'assistant', content:`Could not process query: ${err.response?.data?.error || err.message}`, score:0, citations:[], error:true }])
    } finally {
      setIsQuerying(false)
      setTimeout(() => setPipeline('idle'), 3500)
    }
  }

  async function handleFileUpload(file) {
    if (!file?.name?.endsWith('.pdf')) { setUploadError('Only PDF files are supported.'); return }
    setUploadStage('uploading'); setUploadPct(10); setUploadError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', file.name.replace('.pdf',''))
    try {
      const { data } = await api.post('/api/documents/', fd)
      setUploadPct(30); setUploadStage('processing')
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        try {
          const { data:doc } = await api.get(`/api/documents/${data.id}/`)
          setUploadPct(Math.max(30, doc.progress_percent??0))
          if (doc.progress_percent > 30) setUploadStage('vectorizing')
          if (doc.status === 'indexed' || doc.processed) {
            clearInterval(poll); setUploadPct(100); setUploadStage('indexed')
            fetchDocuments(); setTimeout(() => setUploadStage('idle'), 3000)
          } else if (doc.status === 'failed') {
            clearInterval(poll); setUploadError(doc.last_error||'Indexing failed.'); setUploadStage('idle')
          }
        } catch { clearInterval(poll) }
        if (attempts >= 40) { clearInterval(poll); setUploadStage('idle') }
      }, 2000)
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed.'); setUploadStage('idle')
    }
  }

  const handleDrop = useCallback(e => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) handleFileUpload(f) }, [])

  const totalQ = queryLog.length
  const avgScore = totalQ ? queryLog.reduce((s,q)=>s+q.score,0)/totalQ : 0

  return (
    <div style={{ minHeight:'100vh', background:'#040207', color:'#e2e8f0' }}>
      <style>{`
        @keyframes spin  { to { transform:rotate(360deg) } }
        @keyframes bloop { 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-4px) } }
        .dot { animation:bloop 1s ease-in-out infinite }
        .tab { padding:7px 16px; border-radius:8px; font-size:13px; font-weight:600; border:none; cursor:pointer; transition:all .15s }
        .tab.on  { background:rgba(34,211,238,.13); color:#22d3ee; border:1px solid rgba(34,211,238,.25) }
        .tab.off { background:transparent; color:#475569; border:1px solid transparent }
        .tab.off:hover { color:#94a3b8 }
        .cinput:focus { outline:none; border-color:rgba(34,211,238,.4)!important; box-shadow:0 0 0 3px rgba(34,211,238,.07) }
      `}</style>

      <header style={{ background:'rgba(4,2,7,.9)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,.06)', position:'sticky', top:0, zIndex:50, padding:'0 24px', height:60, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ background:'rgba(34,211,238,.1)', border:'1px solid rgba(34,211,238,.18)', borderRadius:10, padding:8 }}>
            <ShieldCheck size={18} color="#67e8f9" />
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color:'#fff' }}>MediRAG</div>
            <div style={{ fontSize:9, fontFamily:'monospace', letterSpacing:'.2em', color:'#334155', textTransform:'uppercase' }}>Clinical Intelligence</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {isDemoUser() && <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'rgba(234,179,8,.1)', color:'#eab308', border:'1px solid rgba(234,179,8,.2)', fontWeight:600 }}>Demo mode</span>}
          <span style={{ fontSize:13, color:'#475569' }}>Dr. {user?.email?.split('@')[0]??'Clinician'}</span>
          <button onClick={logout} style={{ fontSize:12, color:'#475569', background:'none', border:'none', cursor:'pointer' }}>Sign out</button>
        </div>
      </header>

      <main style={{ maxWidth:1200, margin:'0 auto', padding:'28px 24px' }}>
        <div style={{ display:'flex', gap:5, marginBottom:22 }}>
          {[
            { key:'query',     label:'Clinical Agent' },
            { key:'adk',       label:'ADK Agent', badge:'MCP' },
            { key:'documents', label:'Patient Records' },
            { key:'analytics', label:'Analytics' },
          ].map(t => (
            <button key={t.key} className={`tab ${activeTab===t.key?'on':'off'}`} onClick={() => setActiveTab(t.key)}>
              {t.label}
              {t.badge && <span style={{ marginLeft:5, fontSize:9, padding:'1px 5px', borderRadius:4, background:'rgba(167,139,250,.15)', color:'#a78bfa', fontFamily:'monospace' }}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'query' && (
          <div style={{ display:'flex', flexDirection:'column', height:700, background:'rgba(255,255,255,.025)', border:'1px solid rgba(255,255,255,.07)', borderRadius:16, overflow:'hidden' }}>
            <div style={{ padding:'13px 20px', borderBottom:'1px solid rgba(255,255,255,.06)', background:'rgba(255,255,255,.02)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ position:'relative' }}>
                  <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(34,211,238,.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <ShieldCheck size={18} color="#22d3ee" />
                  </div>
                  <div style={{ position:'absolute', bottom:1, right:1, width:9, height:9, background:'#22c55e', borderRadius:'50%', border:'2px solid #040207' }} />
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0' }}>MediRAG Verifier</div>
                  <div style={{ fontSize:11, color:'#475569' }}>Dual-agent pipeline active</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <span style={{ fontSize:10, padding:'3px 9px', borderRadius:5, background:'rgba(34,211,238,.08)', color:'#22d3ee', border:'1px solid rgba(34,211,238,.18)', fontWeight:600, fontFamily:'monospace' }}>Gemini 1.5 Flash</span>
                <span style={{ fontSize:10, padding:'3px 9px', borderRadius:5, background:'rgba(249,115,22,.08)', color:'#fb923c', border:'1px solid rgba(249,115,22,.18)', fontWeight:600, fontFamily:'monospace' }}>Groq fallback</span>
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'18px 20px', display:'flex', flexDirection:'column', gap:18, background:'rgba(0,0,0,.15)' }}>
              {pipelineStage !== 'idle' && <PipelineVisualizer stage={pipelineStage} result={lastResult} />}

              {chatHistory.map((msg, idx) => (
                <div key={idx} style={{ display:'flex', justifyContent:msg.role==='user'?'flex-end':'flex-start', alignItems:'flex-start', gap:10 }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width:30, height:30, background:msg.error?'#7f1d1d':'rgba(34,211,238,.12)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                      <ShieldCheck size={15} color={msg.error?'#f87171':'#22d3ee'} />
                    </div>
                  )}
                  <div style={{ maxWidth:'78%', display:'flex', flexDirection:'column', gap:5 }}>
                    <div style={{ padding:'11px 15px', fontSize:13, lineHeight:1.65, borderRadius:msg.role==='user'?'14px 4px 14px 14px':'4px 14px 14px 14px', background:msg.role==='user'?'linear-gradient(135deg,#0ea5e9,#0284c7)':msg.error?'rgba(239,68,68,.07)':'rgba(255,255,255,.04)', border:msg.role==='assistant'?`1px solid ${msg.error?'rgba(239,68,68,.2)':'rgba(255,255,255,.07)'}`:' none', color:'#e2e8f0', whiteSpace:'pre-wrap' }}>
                      {msg.content}
                    </div>
                    {msg.role==='assistant' && msg.model_used!=='system' && !msg.error && (
                      <>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:5, alignItems:'center' }}>
                          <FaithfulnessBadge score={msg.score} regenerated={msg.regenerated} />
                          {msg.latency_ms && <span style={{ fontSize:10, color:'#334155', fontFamily:'monospace', display:'flex', alignItems:'center', gap:3 }}><Clock size={9}/>{msg.latency_ms}ms · {msg.context_count??0} chunks</span>}
                          {msg.citations?.map((c,i) => (
                            <button key={i} style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:5, fontSize:10, fontWeight:500, background:'rgba(255,255,255,.04)', color:'#64748b', border:'1px solid rgba(255,255,255,.07)', cursor:'pointer' }}>
                              <BookOpen size={9}/>{c}
                            </button>
                          ))}
                        </div>
                        <ScoreBar score={msg.score} />
                      </>
                    )}
                  </div>
                  {msg.role==='user' && <div style={{ width:30, height:30, background:'rgba(255,255,255,.06)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}><User size={14} color="#64748b"/></div>}
                </div>
              ))}

              {isQuerying && (
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:30, height:30, background:'rgba(34,211,238,.12)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Loader2 size={15} color="#22d3ee" style={{ animation:'spin 1s linear infinite' }} />
                  </div>
                  <div style={{ padding:'11px 15px', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', borderRadius:'4px 14px 14px 14px', display:'flex', alignItems:'center', gap:8 }}>
                    {[0,150,300].map((d,i)=><div key={i} className="dot" style={{ width:5, height:5, borderRadius:'50%', background:'#22d3ee', opacity:.6, animationDelay:`${d}ms` }} />)}
                    <span style={{ fontSize:11, color:'#475569', marginLeft:4 }}>Running dual-agent verification…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {chatHistory.length <= 2 && (
              <div style={{ padding:'8px 18px', borderTop:'1px solid rgba(255,255,255,.04)', background:'rgba(0,0,0,.1)', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:10, color:'#334155', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'.06em', flexShrink:0 }}>Demo</span>
                {GUIDED_DEMO.map((d,i)=>(
                  <button key={i} onClick={()=>handleSendMessage(null,d.query)} title={d.hint} style={{ fontSize:11, padding:'4px 10px', borderRadius:18, background:'rgba(255,255,255,.04)', color:'#64748b', border:'1px solid rgba(255,255,255,.07)', cursor:'pointer' }}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding:'13px 15px', background:'rgba(0,0,0,.2)', borderTop:'1px solid rgba(255,255,255,.06)' }}>
              <form onSubmit={handleSendMessage} style={{ position:'relative', display:'flex', alignItems:'center' }}>
                <input className="cinput" type="text" value={inputValue} onChange={e=>setInputValue(e.target.value)} placeholder="Ask a clinical question about the patient records…" disabled={isQuerying}
                  style={{ width:'100%', padding:'12px 50px 12px 16px', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', borderRadius:11, color:'#e2e8f0', fontSize:13, transition:'border-color .2s, box-shadow .2s' }} />
                <button type="submit" disabled={!inputValue.trim()||isQuerying} style={{ position:'absolute', right:7, padding:7, borderRadius:8, border:'none', background:!inputValue.trim()||isQuerying?'rgba(255,255,255,.06)':'#0ea5e9', cursor:!inputValue.trim()||isQuerying?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Send size={15} color={!inputValue.trim()||isQuerying?'#334155':'#fff'} />
                </button>
              </form>
              <p style={{ fontSize:10, color:'#1e293b', textAlign:'center', marginTop:7 }}>Responses fact-checked by Critic Agent · threshold 0.6 · Groq fallback on rejection</p>
            </div>
          </div>
        )}

        {activeTab === 'adk' && (
          <div style={{ height:700, background:'rgba(255,255,255,.025)', border:'1px solid rgba(255,255,255,.07)', borderRadius:16, overflow:'hidden' }}>
            <ADKAgentPanel />
          </div>
        )}

        {activeTab === 'documents' && (
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div onDragOver={e=>e.preventDefault()} onDrop={handleDrop}
              style={{ border:`2px dashed ${uploadStage!=='idle'?'rgba(34,211,238,.35)':'rgba(255,255,255,.1)'}`, borderRadius:14, padding:'44px 24px', background:uploadStage!=='idle'?'rgba(34,211,238,.02)':'rgba(255,255,255,.01)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', transition:'all .3s' }}>
              {uploadStage === 'idle' ? (
                <>
                  <div style={{ width:60, height:60, borderRadius:'50%', background:'rgba(34,211,238,.07)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
                    <UploadCloud size={26} color="#22d3ee" />
                  </div>
                  <h3 style={{ fontSize:15, fontWeight:600, color:'#e2e8f0', marginBottom:7 }}>Upload patient records</h3>
                  <p style={{ fontSize:13, color:'#475569', textAlign:'center', maxWidth:380, marginBottom:18 }}>Drop a PDF — encrypted, chunked into 1000-char segments, embedded as 768-dim vectors via text-embedding-004.</p>
                  {uploadError && <p style={{ fontSize:13, color:'#f87171', marginBottom:10 }}>{uploadError}</p>}
                  <input ref={fileInputRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>e.target.files?.[0]&&handleFileUpload(e.target.files[0])} />
                  <button onClick={()=>fileInputRef.current?.click()} style={{ padding:'9px 22px', background:'#0ea5e9', border:'none', borderRadius:9, color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer' }}>Browse files</button>
                </>
              ) : <UploadProgress stage={uploadStage} progress={uploadProgress} />}
            </div>
            {documents.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                <h4 style={{ fontSize:11, fontWeight:600, color:'#475569', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:2 }}>Indexed records ({documents.length})</h4>
                {documents.map(doc=>(
                  <div key={doc.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', borderRadius:9, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                      <FileText size={15} color="#475569" />
                      <div>
                        <div style={{ fontSize:13, fontWeight:500, color:'#e2e8f0' }}>{doc.title}</div>
                        <div style={{ fontSize:11, color:'#334155', fontFamily:'monospace' }}>{doc.total_chunks??0} chunks · {doc.progress_percent??0}% indexed</div>
                      </div>
                    </div>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:600, background:doc.status==='indexed'?'rgba(34,197,94,.1)':'rgba(234,179,8,.1)', color:doc.status==='indexed'?'#22c55e':'#eab308' }}>
                      {doc.status??(doc.processed?'indexed':'processing')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14 }}>
              {[
                { label:'Indexed records',       value:documents.length,                              color:'#22d3ee' },
                { label:'Avg faithfulness',       value:`${Math.round(avgScore*100)}%`,               color:'#22c55e' },
                { label:'Verified answers',       value:queryLog.filter(q=>q.passed).length,          color:'#3b82f6' },
                { label:'Hallucinations blocked', value:queryLog.filter(q=>!q.passed&&q.score>0).length, color:'#f97316' },
              ].map(k=>(
                <div key={k.label} style={{ padding:'18px', borderRadius:11, background:'rgba(255,255,255,.025)', border:'1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:7 }}>{k.label}</div>
                  <div style={{ fontSize:30, fontWeight:800, color:k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ padding:'20px', borderRadius:11, background:'rgba(255,255,255,.025)', border:'1px solid rgba(255,255,255,.07)' }}>
              <h3 style={{ fontSize:13, fontWeight:600, color:'#64748b', marginBottom:18 }}>
                Faithfulness score trend {totalQ===0 && <span style={{ fontWeight:400, color:'#334155', marginLeft:8 }}>(submit queries to populate)</span>}
              </h3>
              {faithData.length > 0 ? (
                <div style={{ height:180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={faithData}>
                      <defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25}/><stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,.04)" />
                      <XAxis dataKey="q" axisLine={false} tickLine={false} tick={{ fill:'#475569', fontSize:11 }} />
                      <YAxis domain={[0,100]} axisLine={false} tickLine={false} tick={{ fill:'#475569', fontSize:11 }} />
                      <Tooltip contentStyle={{ background:'#0f172a', border:'1px solid rgba(255,255,255,.1)', borderRadius:8 }} itemStyle={{ color:'#22d3ee', fontWeight:600 }} formatter={v=>[`${v}%`,'Score']} />
                      <Area type="monotone" dataKey="score" stroke="#22d3ee" strokeWidth={2} fillOpacity={1} fill="url(#fg)" dot={{ fill:'#22d3ee', r:3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'#1e293b', fontSize:12 }}>No queries yet</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
