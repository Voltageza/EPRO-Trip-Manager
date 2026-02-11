import React, { useState, useEffect, useCallback } from 'react';
import { fetchTrips } from './api/tripsApi.js';
import TripDayGroup from './components/TripDayGroup.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatusBar from './components/StatusBar.jsx';

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function App() {
  const [date, setDate] = useState(getYesterday);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ message: '', type: 'info' });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadTrips = useCallback(async (targetDate) => {
    setLoading(true);
    setStatus({ message: '', type: 'info' });
    try {
      const data = await fetchTrips(targetDate, targetDate);
      setTrips(data);
      if (data.length === 0) {
        setStatus({ message: 'No trips found for this date. Try syncing from Cartrack.', type: 'info' });
      }
    } catch (err) {
      setStatus({ message: `Failed to load trips: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrips(date);
  }, [date, loadTrips]);

  function handleDateChange(newDate) {
    setDate(newDate);
    setSidebarOpen(false);
  }

  function handleSyncResult(result) {
    if (result.error) {
      setStatus({ message: `Sync failed: ${result.error}`, type: 'error' });
    } else {
      setStatus({ message: `Synced ${result.synced} trip${result.synced !== 1 ? 's' : ''} from Cartrack`, type: 'success' });
      loadTrips(date);
    }
  }

  function handleTripUpdate(updated) {
    setTrips(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
  }

  // KPI computations
  const totalKm = trips.reduce((s, t) => s + (t.distance_km || 0), 0);
  const businessCount = trips.filter(t => t.is_business !== 0).length;
  const privateCount = trips.length - businessCount;

  // Group trips by date
  const grouped = {};
  for (const trip of trips) {
    const key = trip.trip_date || date;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(trip);
  }
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="dashboard">
      <Sidebar
        date={date}
        onDateChange={handleDateChange}
        onSynced={handleSyncResult}
        trips={trips}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
      />

      <main className="main-content">
        <div className="kpi-row">
          <div className="kpi-card">
            <div className="kpi-label">Trips</div>
            <div className="kpi-value">{trips.length}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Distance</div>
            <div className="kpi-value km">{totalKm.toFixed(1)} km</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Business</div>
            <div className="kpi-value business">{businessCount}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Private</div>
            <div className="kpi-value private">{privateCount}</div>
          </div>
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <span>Loading trips...</span>
          </div>
        )}
        {!loading && sortedDates.length === 0 && !status.message && (
          <div className="empty">No trips for this date.</div>
        )}
        {sortedDates.map(d => (
          <TripDayGroup
            key={d}
            date={d}
            trips={grouped[d]}
            onTripUpdate={handleTripUpdate}
            onTripsReload={() => loadTrips(date)}
          />
        ))}
      </main>

      <StatusBar message={status.message} type={status.type} />
    </div>
  );
}
