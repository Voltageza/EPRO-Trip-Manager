import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { checkAuthStatus, loginApi, setupApi, fetchVehiclesApi, syncVehiclesApi } from '../api/tripsApi.js';

export default function LoginPage() {
  const { login } = useAuth();
  const [needsSetup, setNeedsSetup] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [defaultVehicle, setDefaultVehicle] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkAuthStatus()
      .then(data => {
        setNeedsSetup(data.needsSetup);
        if (data.needsSetup) {
          // Load vehicles for the setup dropdown
          fetchVehiclesApi()
            .then(list => {
              if (!list || list.length === 0) {
                return syncVehiclesApi().then(r => r.vehicles || []);
              }
              return list;
            })
            .then(setVehicles)
            .catch(() => {});
        }
      })
      .catch(() => setNeedsSetup(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      let data;
      if (needsSetup) {
        data = await setupApi(username, password, displayName, defaultVehicle || undefined);
      } else {
        data = await loginApi(username, password);
      }
      login(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (needsSetup === null) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <h1>E-Pro Trip Manager</h1>
          <span className="login-subtitle">Fleet Tracking & Reports</span>
        </div>

        <h2 className="login-title">
          {needsSetup ? 'Create Admin Account' : 'Sign In'}
        </h2>
        {needsSetup && (
          <p className="login-hint">Set up the first admin account to get started.</p>
        )}

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

          {needsSetup && (
            <div className="login-field">
              <label htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              required
              minLength={4}
            />
          </div>

          {needsSetup && vehicles.length > 0 && (
            <div className="login-field">
              <label htmlFor="defaultVehicle">Default Vehicle</label>
              <select
                id="defaultVehicle"
                value={defaultVehicle}
                onChange={e => setDefaultVehicle(e.target.value)}
              >
                <option value="">All vehicles</option>
                {vehicles.filter(v => v.is_active).map(v => (
                  <option key={v.registration} value={v.registration}>
                    {v.description || v.registration}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Please wait...' : needsSetup ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
