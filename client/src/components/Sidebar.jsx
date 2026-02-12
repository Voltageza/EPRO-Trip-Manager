import React, { useState } from 'react';
import DatePicker from './DatePicker.jsx';
import SyncButton from './SyncButton.jsx';
import VehicleSelector from './VehicleSelector.jsx';
import UserManager from './UserManager.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Sidebar({
  date, onDateChange, onSynced, trips, open, onToggle,
  vehicles, selectedVehicles, onVehicleSelectionChange, onVehiclesRefresh,
}) {
  const { user, logout } = useAuth();
  const [showUserManager, setShowUserManager] = useState(false);
  const totalKm = trips.reduce((s, t) => s + (t.distance_km || 0), 0);
  const businessCount = trips.filter(t => t.is_business !== 0).length;
  const privateCount = trips.length - businessCount;

  return (
    <>
      <button className="sidebar-toggle" onClick={onToggle} aria-label="Toggle sidebar">
        {open ? '\u2715' : '\u2630'}
      </button>
      <div className={`sidebar-overlay ${open ? 'visible' : ''}`} onClick={onToggle} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <h1>E-Pro Trip Manager</h1>
          <span className="app-subtitle">Fleet Tracking & Reports</span>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Date</div>
          <DatePicker value={date} onChange={onDateChange} />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Vehicles</div>
          <VehicleSelector
            vehicles={vehicles}
            selectedVehicles={selectedVehicles}
            onSelectionChange={onVehicleSelectionChange}
            onVehiclesRefresh={onVehiclesRefresh}
          />
        </div>

        <div className="sidebar-section">
          <SyncButton date={date} onSynced={onSynced} selectedVehicles={selectedVehicles} />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Quick Stats</div>
          <div className="sidebar-stats">
            <div className="sidebar-stat">
              <span className="sidebar-stat-label">Trips</span>
              <span className="sidebar-stat-value">{trips.length}</span>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat-label">Distance</span>
              <span className="sidebar-stat-value">{totalKm.toFixed(1)} km</span>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat-label">Business</span>
              <span className="sidebar-stat-value business">{businessCount}</span>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat-label">Private</span>
              <span className="sidebar-stat-value private">{privateCount}</span>
            </div>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{user?.display_name || user?.username}</span>
            {user?.role === 'admin' && <span className="role-badge role-admin">admin</span>}
          </div>
          {user?.role === 'admin' && (
            <button className="sidebar-user-btn" onClick={() => setShowUserManager(true)}>
              Manage Users
            </button>
          )}
          <button className="sidebar-user-btn sidebar-logout-btn" onClick={logout}>
            Log Out
          </button>
        </div>
      </aside>

      {showUserManager && <UserManager onClose={() => setShowUserManager(false)} />}
    </>
  );
}
