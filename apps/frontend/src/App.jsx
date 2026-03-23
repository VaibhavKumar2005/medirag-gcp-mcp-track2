import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard   from './Dashboard'
import Monitoring  from './Monitoring'
import Analytics   from './Analytics'
import LandingPage from './LandingPage'
import Login       from './Login'
import { isAuthenticated } from './lib/auth'

function RequireAuth({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/about"      element={<LandingPage />} />
        <Route path="/login"      element={<Login />} />
        <Route path="/"           element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/monitoring" element={<RequireAuth><Monitoring /></RequireAuth>} />
        <Route path="/analytics"  element={<RequireAuth><Analytics /></RequireAuth>} />
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
