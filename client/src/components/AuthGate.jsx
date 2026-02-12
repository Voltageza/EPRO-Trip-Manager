import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import LoginPage from './LoginPage.jsx';
import App from '../App.jsx';

export default function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <App />;
}
