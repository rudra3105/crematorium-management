import React from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import PublicPage from './pages/PublicPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <div className="container">
      <header>
        <h1>Crematorium Management System</h1>
        <nav>
          <Link to="/">Citizen Portal</Link>
          <Link to="/admin">Admin Dashboard</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<PublicPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}
