import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Shield, Zap, BrainCircuit,
  CheckCircle2, AlertTriangle, FileSearch, Activity,
} from 'lucide-react'
import { isAuthenticated } from '@/lib/auth'

const S = {
  page:    { minHeight: '100vh', background: '#040207', color: '#e2e8f0', fontFamily: 'inherit' },
  orb:     (color, top, left, size = 400, delay = 0) => ({
    position: 'absolute', width: size, height: size, borderRadius: '50%',
    background: color, filter: 'blur(120px)', opacity: 0.12,
    top, left, pointerEvents: 'none',
    animation: `orbDrift ${18 + delay}s ease-in-out infinite alternate`,
    animationDelay: `${delay}s`,
  }),
  nav:     {
    position: 'sticky', top: 0, zIndex: 50,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(4,2,7,0.85)', backdropFilter: 'blur(24px)',
    padding: '0 40px', height: 64,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  pill:    (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 14px', borderRadius: 20,
    background: `${color}18`, border: `1px solid ${color}30`,
    fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.18em',
    textTransform: 'uppercase', color,
  }),
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '13px 28px', borderRadius: 12,
    background: '#22d3ee', border: 'none',
    color: '#040207', fontWeight: 700, fontSize: 15, cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  btnGhost: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '13px 24px', borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', fontWeight: 600, fontSize: 14, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16, padding: '24px',
  },
}

const PIPELINE_STEPS = [
  { icon: FileSearch,  color: '#22d3ee', label: 'Vector retrieval',      sub: 'pgvector · top-5 chunks' },
  { icon: BrainCircuit,color: '#a78bfa', label: 'Gemini 1.5 Flash',      sub: 'JSON-mode generation' },
  { icon: Shield,      color: '#22c55e', label: 'Critic Agent',           sub: 'Semantic cosine ≥ 0.6' },
  { icon: AlertTriangle,color:'#f97316', label: 'Groq fallback',          sub: 'Triggered on rejection' },
  { icon: CheckCircle2,color: '#22c55e', label: 'Verified answer',        sub: 'Citations + score' },
]

const FEATURES = [
  {
    icon: Shield,
    color: '#22d3ee',
    title: 'Hallucination-resistant by design',
    body: 'Every answer is scored for faithfulness before reaching the user. Responses that score below 0.6 are automatically rejected and regenerated with a stricter prompt.',
  },
  {
    icon: BrainCircuit,
    color: '#a78bfa',
    title: 'MCP-native tool architecture',
    body: 'Five clinical RAG tools exposed via Model Context Protocol Streamable HTTP. The ADK agent orchestrates them — search, query, list, chunk retrieval, and metrics.',
  },
  {
    icon: Activity,
    color: '#22c55e',
    title: 'Production observability',
    body: 'Prometheus metrics track hallucination rate, fallback count, faithfulness distribution, and latency per query. CostOps, QualityOps, and DriftOps run on every request.',
  },
  {
    icon: Zap,
    color: '#f97316',
    title: 'Cloud Run · keyless CI/CD',
    body: 'Three services deployed via GitHub Actions with Workload Identity Federation — no stored credentials anywhere. OIDC-based keyless authentication throughout.',
  },
]

const DEMO_STATS = [
  { value: '0.6',  label: 'Faithfulness threshold',  color: '#22c55e' },
  { value: '768',  label: 'Embedding dimensions',     color: '#22d3ee' },
  { value: '2',    label: 'LLM providers (failover)', color: '#a78bfa' },
  { value: '5',    label: 'MCP tools exposed',        color: '#f97316' },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const authed   = useMemo(() => isAuthenticated(), [])

  return (
    <div style={S.page}>
      <style>{`
        @keyframes orbDrift { from { transform: translate(0,0) scale(1); } to { transform: translate(40px,30px) scale(1.08); } }
        .lp-btn-primary:hover { opacity: 0.88; }
        .lp-btn-ghost:hover   { background: rgba(255,255,255,0.07); color: #e2e8f0; }
        .feature-card:hover   { border-color: rgba(255,255,255,0.14); transform: translateY(-2px); }
        .feature-card { transition: all 0.2s; }
        .step-line { width: 1px; height: 28px; background: rgba(255,255,255,0.08); margin: 0 auto; }
      `}</style>

      {/* Ambient orbs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={S.orb('#22d3ee', '-8%', '-6%', 500, 0)} />
        <div style={S.orb('#22c55e', '60%', '80%', 420, 6)} />
        <div style={S.orb('#a78bfa', '25%', '70%', 320, 12)} />
      </div>

      {/* Nav */}
      <header style={S.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 10, padding: 9 }}>
            <Shield size={18} color="#67e8f9" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#fff' }}>MediRAG</div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.22em', color: '#334155', textTransform: 'uppercase' }}>
              Verified Clinical Intelligence
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="lp-btn-ghost" style={S.btnGhost} onClick={() => navigate('/login')}>
            Sign in
          </button>
          <button className="lp-btn-primary" style={S.btnPrimary} onClick={() => navigate(authed ? '/' : '/login')}>
            {authed ? 'Open workspace' : 'Try demo'} <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 10, maxWidth: 1120, margin: '0 auto', padding: '0 32px 80px' }}>

        {/* Hero */}
        <section style={{ paddingTop: 80, paddingBottom: 72, textAlign: 'center' }}>
          <div style={{ marginBottom: 20 }}>
            <span style={S.pill('#22d3ee')}>
              <Zap size={11} /> Track 2 · Model Context Protocol · Gen AI Academy APAC
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(38px, 6vw, 72px)', fontWeight: 800,
            lineHeight: 1.08, letterSpacing: '-0.03em',
            color: '#fff', maxWidth: 860, margin: '0 auto 24px',
          }}>
            Clinical AI that{' '}
            <span style={{ color: '#22d3ee' }}>refuses to guess.</span>
          </h1>

          <p style={{
            fontSize: 18, lineHeight: 1.7, color: '#94a3b8',
            maxWidth: 600, margin: '0 auto 40px',
          }}>
            MediRAG answers clinical questions about patient records with verified,
            citation-backed responses. If the answer isn't in the documents, the system
            says so — it doesn't invent one.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="lp-btn-primary" style={{ ...S.btnPrimary, fontSize: 16, padding: '15px 32px' }}
              onClick={() => navigate(authed ? '/' : '/login')}>
              {authed ? 'Open workspace' : 'Try the demo'} <ArrowRight size={17} />
            </button>
            <button className="lp-btn-ghost" style={S.btnGhost}
              onClick={() => window.open('https://github.com/VaibhavKumar2005/cloud-native-ai-library-system', '_blank')}>
              View on GitHub
            </button>
          </div>

          {/* Demo notice */}
          <p style={{ marginTop: 20, fontSize: 13, color: '#334155' }}>
            No account needed — click Try Demo to load pre-indexed clinical scenarios instantly
          </p>
        </section>

        {/* Stats row */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 72 }}>
          {DEMO_STATS.map(s => (
            <div key={s.label} style={{ ...S.card, textAlign: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 8 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#475569', letterSpacing: '0.06em' }}>{s.label}</div>
            </div>
          ))}
        </section>

        {/* Pipeline diagram */}
        <section style={{ marginBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <span style={S.pill('#a78bfa')}>How it works</span>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: '#fff', marginTop: 16 }}>
              Dual-agent verification pipeline
            </h2>
            <p style={{ color: '#64748b', marginTop: 10, maxWidth: 520, margin: '12px auto 0' }}>
              Every answer travels through retrieval, generation, semantic verification, and
              optional fallback before reaching the clinician.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 480, margin: '0 auto' }}>
            {PIPELINE_STEPS.map((step, i) => {
              const Icon = step.icon
              return (
                <div key={step.label} style={{ width: '100%' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '16px 20px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${step.color}22`,
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: `${step.color}15`,
                      border: `1px solid ${step.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={20} color={step.color} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{step.label}</div>
                      <div style={{ fontSize: 12, color: '#475569', fontFamily: 'monospace' }}>{step.sub}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: '50%', background: `${step.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: step.color, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && <div className="step-line" />}
                </div>
              )
            })}
          </div>
        </section>

        {/* Features grid */}
        <section style={{ marginBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <span style={S.pill('#22c55e')}>What we built</span>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: '#fff', marginTop: 16 }}>
              Production-grade from the ground up
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div key={f.title} className="feature-card" style={S.card}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${f.color}12`, border: `1px solid ${f.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <Icon size={20} color={f.color} />
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.65, color: '#64748b' }}>{f.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Live demo CTA */}
        <section style={{
          borderRadius: 20, padding: '52px 40px', textAlign: 'center',
          background: 'rgba(34,211,238,0.04)',
          border: '1px solid rgba(34,211,238,0.15)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, borderRadius: '50%', background: '#22d3ee', filter: 'blur(80px)', opacity: 0.06, pointerEvents: 'none' }} />
          <span style={{ ...S.pill('#22d3ee'), marginBottom: 20, display: 'inline-flex' }}>
            Live on Cloud Run
          </span>
          <h2 style={{ fontSize: 36, fontWeight: 800, color: '#fff', marginBottom: 16 }}>
            See it handle a real clinical query
          </h2>
          <p style={{ fontSize: 16, color: '#64748b', maxWidth: 540, margin: '0 auto 32px' }}>
            Three pre-indexed patient scenarios — chest pain, post-surgical discharge, metabolic panel.
            Ask any clinical question and watch the verification pipeline respond in real time.
          </p>
          <button className="lp-btn-primary" style={{ ...S.btnPrimary, fontSize: 16, padding: '15px 36px' }}
            onClick={() => navigate(authed ? '/' : '/login')}>
            Launch MediRAG <ArrowRight size={17} />
          </button>
          <p style={{ marginTop: 14, fontSize: 12, color: '#1e293b' }}>
            One click — no signup required · Demo credentials loaded automatically
          </p>
        </section>

      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '24px 40px', textAlign: 'center', position: 'relative', zIndex: 10 }}>
        <p style={{ fontSize: 12, color: '#1e293b' }}>
          MediRAG · Team submission · Gen AI Academy APAC Edition · Track 2 — Model Context Protocol ·{' '}
          <a href="https://github.com/VaibhavKumar2005/cloud-native-ai-library-system" target="_blank" rel="noreferrer"
            style={{ color: '#334155', textDecoration: 'none' }}>
            GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}
