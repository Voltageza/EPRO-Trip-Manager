import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext.jsx';
import AuthGate from './components/AuthGate.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <AuthGate />
  </AuthProvider>
);
