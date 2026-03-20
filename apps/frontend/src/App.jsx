import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import Monitoring from './Monitoring';
import Analytics from './Analytics';
import LandingPage from './LandingPage';
// Note: We can ignore ProtectedRoute and Login for the submission build

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Main Entry Points */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/login" element={<Dashboard />} />
        
        {/* Technical Showcase Routes (Now Public) */}
        <Route path="/monitoring" element={<Monitoring />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/about" element={<LandingPage />} />

        {/* Catch-all: Redirect any stray paths to the Dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
