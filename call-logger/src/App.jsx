import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import JobList from './components/JobList.jsx';
import JobForm from './components/JobForm.jsx';
import JobDetail from './components/JobDetail.jsx';
import ElectricianManager from './components/ElectricianManager.jsx';

export default function App() {
  const { user, logout } = useAuth();
  const [view, setView] = useState('list'); // 'list' | 'form' | 'detail' | 'electricians'
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Auto-refresh job list every 30s and when the tab regains focus
  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const handleSelectJob = (job) => {
    setSelectedJobId(job.id);
    setView('detail');
  };

  const handleCreated = (job) => {
    refresh();
    setSelectedJobId(job.id);
    setView('detail');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedJobId(null);
  };

  return (
    <div className="app">
      <nav className="top-nav">
        <div className="nav-brand">
          <h1>E-Pro Call Logger</h1>
        </div>
        <div className="nav-right">
          <button
            className={`btn-nav ${view === 'electricians' ? 'btn-nav-active' : ''}`}
            onClick={() => setView(view === 'electricians' ? 'list' : 'electricians')}
          >
            Electricians
          </button>
          <span className="nav-user">{user.display_name || user.username}</span>
          <button className="btn-text nav-logout" onClick={logout}>Sign Out</button>
        </div>
      </nav>

      <main className="main-content">
        {view === 'list' && (
          <JobList
            onSelectJob={handleSelectJob}
            onNewJob={() => setView('form')}
            refreshKey={refreshKey}
          />
        )}
        {view === 'form' && (
          <JobForm
            onCreated={handleCreated}
            onCancel={handleBackToList}
          />
        )}
        {view === 'detail' && selectedJobId && (
          <JobDetail
            jobId={selectedJobId}
            onBack={handleBackToList}
            onUpdated={refresh}
          />
        )}
        {view === 'electricians' && (
          <ElectricianManager onBack={() => setView('list')} />
        )}
      </main>
    </div>
  );
}
