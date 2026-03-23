/**
 * MediRAG API client — Axios with automatic JWT refresh.
 * Supports demo mode: call api.setDemoToken(token) after /api/demo/token/
 */
import axios from 'axios'
import { clearSession, getAccessToken, getRefreshToken, storeSession } from './auth'

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({ baseURL: API_BASE })

// ── Request interceptor ──────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    } else if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json'
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor — auto-refresh on 401 ───────────────────────────────
let isRefreshing = false
let failedQueue  = []

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token))
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (!error.response || error.response.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`
        return api(originalRequest)
      })
    }
    originalRequest._retry = true
    isRefreshing = true
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      isRefreshing = false
      clearSession()
      window.location.href = '/login'
      return Promise.reject(error)
    }
    try {
      const { data } = await axios.post(`${API_BASE}/api/token/refresh/`, { refresh: refreshToken })
      storeSession(data.access, data.refresh || refreshToken)
      processQueue(null, data.access)
      originalRequest.headers.Authorization = `Bearer ${data.access}`
      return api(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      clearSession()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
