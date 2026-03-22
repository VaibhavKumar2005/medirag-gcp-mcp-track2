import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Zap, Loader2 } from 'lucide-react'
import api, { API_BASE } from './lib/api'
import { storeSession } from './lib/auth'

export default function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/api/token/', { username: email, password })
      storeSession(data.access, data.refresh, false)
      navigate('/')
    } catch {
      setError('Invalid credentials. Use the Demo Access button below to try the app.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDemoAccess() {
    setDemoLoading(true)
    setError('')
    try {
      // 1. Get demo JWT
      const { data } = await api.get('/api/demo/token/')
      storeSession(data.access, data.refresh, true)
      // 2. Seed the demo library (fire-and-forget — non-blocking)
      api.post('/api/demo/seed/', {}, {
        headers: { Authorization: `Bearer ${data.access}` }
      }).catch(() => {})
      navigate('/')
    } catch {
      setError('Demo mode is currently unavailable. Please try again shortly.')
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#040207] flex items-center justify-center px-4">
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: '2.5rem',
        width: '100%',
        maxWidth: 420,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '2rem' }}>
          <div style={{
            background: 'rgba(34,211,238,0.12)',
            border: '1px solid rgba(34,211,238,0.2)',
            borderRadius: 12,
            padding: 10,
          }}>
            <Shield size={22} color="#67e8f9" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#fff' }}>MediRAG</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.2em', color: '#475569', textTransform: 'uppercase' }}>
              Clinical Intelligence
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Sign in</h2>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: '1.5rem' }}>
          Secure clinical document intelligence platform
        </p>

        {/* Demo access — prominent for judges */}
        <button
          onClick={handleDemoAccess}
          disabled={demoLoading}
          style={{
            width: '100%',
            padding: '14px',
            background: 'rgba(34,211,238,0.12)',
            border: '1px solid rgba(34,211,238,0.3)',
            borderRadius: 12,
            color: '#67e8f9',
            fontWeight: 600,
            fontSize: 14,
            cursor: demoLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: '1.25rem',
          }}
        >
          {demoLoading
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading demo…</>
            : <><Zap size={16} /> Try Demo — No account needed</>
          }
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: 12, color: '#475569' }}>or sign in with credentials</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              color: '#e2e8f0',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              color: '#e2e8f0',
              fontSize: 14,
              outline: 'none',
            }}
          />
          {error && (
            <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '13px',
              background: loading ? '#334155' : '#0ea5e9',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…</> : 'Sign in'}
          </button>
        </form>

        <p style={{ fontSize: 11, color: '#334155', textAlign: 'center', marginTop: '1.5rem' }}>
          Demo mode uses pre-loaded clinical scenarios. No real patient data.
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
