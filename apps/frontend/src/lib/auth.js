const ACCESS_TOKEN_KEY  = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const DEMO_MODE_KEY     = 'is_demo'

export function getAccessToken()  { return localStorage.getItem(ACCESS_TOKEN_KEY) }
export function getRefreshToken() { return localStorage.getItem(REFRESH_TOKEN_KEY) }
export function isAuthenticated() { return Boolean(getAccessToken()) }
export function isDemoUser()      { return localStorage.getItem(DEMO_MODE_KEY) === 'true' }

export function storeSession(accessToken, refreshToken, isDemo = false) {
  localStorage.setItem(ACCESS_TOKEN_KEY,  accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  localStorage.setItem(DEMO_MODE_KEY, isDemo ? 'true' : 'false')
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(DEMO_MODE_KEY)
}

export function consumeOAuthCallbackHash() {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  if (!hash) return null
  const params      = new URLSearchParams(hash)
  const oauthStatus = params.get('oauth')
  if (!oauthStatus) return null
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  if (oauthStatus === 'success') {
    const code = params.get('code')
    if (code) return { ok: true, provider: params.get('provider'), code }
    return { ok: false, message: 'OAuth login completed without an exchange code.' }
  }
  return { ok: false, error: params.get('error'), message: params.get('message') || 'OAuth login failed.' }
}

// React hook — minimal, no context needed for this scope
import { useState, useEffect } from 'react'
export function useAuth() {
  const [user, setUser] = useState(null)
  useEffect(() => {
    if (isAuthenticated()) {
      setUser({ email: isDemoUser() ? 'demo@medirag.dev' : 'clinician@hospital.org', isDemo: isDemoUser() })
    }
  }, [])
  return {
    user,
    logout: () => { clearSession(); window.location.href = '/login' },
  }
}
