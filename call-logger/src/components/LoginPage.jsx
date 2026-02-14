import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { checkAuthStatus, loginApi } from '../api/api.js';

export default function LoginPage() {
  const { login } = useAuth();
  const [needsSetup, setNeedsSetup] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkAuthStatus()
      .then(data => setNeedsSetup(data.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await loginApi(username, password);
      login(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (needsSetup === null) {
    return <div className="auth-loading"><div className="spinner" /></div>;
  }

  if (needsSetup) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <h1>E-Pro Call Logger</h1>
            <span className="login-subtitle">Service Call Management</span>
          </div>
          <p className="login-hint">
            Please set up an admin account in the Trip Manager first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <h1>E-Pro Call Logger</h1>
          <span className="login-subtitle">Service Call Management</span>
        </div>

        <h2 className="login-title">Sign In</h2>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              minLength={4}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Please wait...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
