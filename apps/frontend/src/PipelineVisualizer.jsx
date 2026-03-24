/**
 * PipelineVisualizer — animates the 5-stage dual-agent verification pipeline
 * in real time as each API response comes back.
 *
 * Props:
 *   stage: 'idle' | 'retrieving' | 'generating' | 'verifying' | 'gating' | 'done' | 'fallback'
 *   result: the API response object (shown after 'done')
 *   query: string — the question being processed
 */
import React, { useEffect, useState, useRef } from 'react'
import {
  Database, BrainCircuit, ShieldCheck, GitBranch,
  CheckCircle2, AlertTriangle, Zap, Clock, BookOpen,
} from 'lucide-react'

const STAGES = [
  {
    key: 'retrieving',
    icon: Database,
    label: 'Vector retrieval',
    detail: 'pgvector cosine search · top-5 chunks',
    color: '#22d3ee',
  },
  {
    key: 'generating',
    icon: BrainCircuit,
    label: 'Primary generation',
    detail: 'Gemini 1.5 Flash · JSON mode · temp 0.1',
    color: '#a78bfa',
  },
  {
    key: 'verifying',
    icon: ShieldCheck,
    label: 'Critic Agent',
    detail: 'text-embedding-004 · cosine similarity',
    color: '#fb923c',
  },
  {
    key: 'gating',
    icon: GitBranch,
    label: 'Faithfulness gate',
    detail: 'threshold 0.6 · pass or reject',
    color: '#f59e0b',
  },
  {
    key: 'done',
    icon: CheckCircle2,
    label: 'Verified response',
    detail: 'Citations · RAGAS metrics · score',
    color: '#22c55e',
  },
]

const STAGE_ORDER = ['retrieving', 'generating', 'verifying', 'gating', 'done']

function getStageIndex(stage) {
  if (stage === 'fallback') return 4
  return STAGE_ORDER.indexOf(stage)
}

// Animated cosine similarity visualisation
function CosineMeter({ score, animating }) {
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    if (!animating && score > 0) {
      let start = null
      const duration = 800
      const animate = (ts) => {
        if (!start) start = ts
        const progress = Math.min((ts - start) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplayed(eased * score)
        if (progress < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }
  }, [score, animating])

  const pct = Math.round(displayed * 100)
  const color = displayed >= 0.85 ? '#22c55e' : displayed >= 0.6 ? '#3b82f6' : '#f97316'

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
          faithfulness score
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'monospace' }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 0.05s linear',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,0.2)',
        fontFamily: 'monospace',
      }}>
        <span>0.0</span>
        <span style={{ color: displayed >= 0.6 ? 'rgba(255,255,255,0.3)' : '#f97316' }}>threshold 0.6</span>
        <span>1.0</span>
      </div>
    </div>
  )
}

// Single stage row
function StageRow({ stage, currentStageIdx, index, result, isFallback }) {
  const active  = index === currentStageIdx
  const done    = index < currentStageIdx
  const pending = index > currentStageIdx
  const isFinalStage = index === 4

  const Icon   = stage.icon
  const FinalIcon = isFallback ? AlertTriangle : CheckCircle2
  const finalColor = isFallback ? '#f97316' : '#22c55e'

  const dotColor = done ? '#22c55e' : active ? stage.color : 'rgba(255,255,255,0.12)'
  const labelColor = pending ? 'rgba(255,255,255,0.25)' : active ? '#fff' : 'rgba(255,255,255,0.7)'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 0',
      opacity: pending ? 0.4 : 1,
      transition: 'opacity 0.3s',
    }}>
      {/* Icon circle */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active
          ? `${stage.color}20`
          : done
            ? 'rgba(34,197,94,0.15)'
            : 'rgba(255,255,255,0.04)',
        border: active
          ? `1px solid ${stage.color}50`
          : done
            ? '1px solid rgba(34,197,94,0.3)'
            : '1px solid rgba(255,255,255,0.06)',
        transition: 'all 0.3s',
        position: 'relative',
      }}>
        {isFinalStage
          ? <FinalIcon size={16} color={done || active ? finalColor : 'rgba(255,255,255,0.2)'} />
          : done
            ? <CheckCircle2 size={16} color="#22c55e" />
            : <Icon size={16} color={active ? stage.color : 'rgba(255,255,255,0.2)'} />
        }
        {active && (
          <div style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            border: `1px solid ${stage.color}`,
            animation: 'pulseRing 1.5s ease-out infinite',
          }} />
        )}
      </div>

      {/* Label + detail */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: labelColor,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {isFinalStage && isFallback && (done || active)
            ? 'Groq / Llama-3.3 fallback'
            : stage.label
          }
          {active && (
            <span style={{
              fontSize: 10, fontFamily: 'monospace', color: stage.color,
              animation: 'blink 1s step-end infinite',
            }}>
              running
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: 1 }}>
          {isFinalStage && isFallback && (done || active)
            ? 'strict prompt · score < 0.6 triggered'
            : stage.detail
          }
        </div>

        {/* Score meter on verify stage */}
        {stage.key === 'verifying' && (done || active) && result?.faithfulness_score != null && (
          <CosineMeter score={result.faithfulness_score} animating={active} />
        )}

        {/* Final result detail */}
        {isFinalStage && done && result && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {result.model_used && (
              <span style={{
                fontSize: 10, fontFamily: 'monospace',
                padding: '2px 7px', borderRadius: 4,
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.5)',
              }}>
                {result.model_used}
              </span>
            )}
            {result.latency_ms && (
              <span style={{
                fontSize: 10, fontFamily: 'monospace',
                padding: '2px 7px', borderRadius: 4,
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <Clock size={9} /> {result.latency_ms}ms
              </span>
            )}
            {result.context_chunks_used != null && (
              <span style={{
                fontSize: 10, fontFamily: 'monospace',
                padding: '2px 7px', borderRadius: 4,
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <BookOpen size={9} /> {result.context_chunks_used} chunks
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PipelineVisualizer({ stage, result, query }) {
  const currentIdx = getStageIndex(stage)
  const isFallback = stage === 'fallback' ||
    (result?.model_used && (result.model_used.includes('groq') || result.model_used.includes('llama')))
  const isIdle = stage === 'idle'

  if (isIdle) return null

  return (
    <div style={{
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: '16px 18px',
      marginBottom: 12,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <style>{`
        @keyframes pulseRing {
          0%   { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.6); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
        marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Zap size={11} color="rgba(255,255,255,0.3)" />
        dual-agent verification pipeline
      </div>

      {/* Connector line + stages */}
      <div style={{ position: 'relative' }}>
        {/* Vertical progress line */}
        <div style={{
          position: 'absolute', left: 17, top: 18,
          width: 2, borderRadius: 1,
          height: `${(STAGES.length - 1) * 58}px`,
          background: 'rgba(255,255,255,0.06)',
          zIndex: 0,
        }}>
          <div style={{
            width: '100%',
            height: `${Math.min(currentIdx / (STAGES.length - 1), 1) * 100}%`,
            background: 'linear-gradient(to bottom, #22d3ee, #22c55e)',
            borderRadius: 1,
            transition: 'height 0.5s ease',
          }} />
        </div>

        {/* Stages */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {STAGES.map((s, i) => (
            <StageRow
              key={s.key}
              stage={s}
              currentStageIdx={currentIdx}
              index={i}
              result={result}
              isFallback={isFallback}
            />
          ))}
        </div>
      </div>

      {/* RAGAS scores if available */}
      {result?.evaluation && Object.keys(result.evaluation).length > 0 && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px',
        }}>
          {Object.entries(result.evaluation)
            .filter(([k]) => k !== 'combined_score')
            .map(([key, val]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                  {key.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>
                  {typeof val === 'number' ? (val * 100).toFixed(0) + '%' : val}
                </span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}
