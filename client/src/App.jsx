import React, { useState, useEffect, useCallback } from 'react';
import { fetchTrips, fetchUnclaimedTrips, claimTrip, unclaimTrip, fetchVehiclesApi, syncVehiclesApi, fetchLocationsApi } from './api/tripsApi.js';
import { useAuth } from './context/AuthContext.jsx';
import TripDayGroup from './components/TripDayGroup.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatusBar from './components/StatusBar.jsx';
import ReportView from './components/ReportView.jsx';

const STORAGE_KEY = 'epro-selected-vehicles';

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function loadSavedSelection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSelection(regs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(regs));
}

export default function App() {
  const { user } = useAuth();
  const [date, setDate] = useState(getYesterday);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ message: '', type: 'info' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicles, setSelectedVehicles] = useState([]);
  const [locations, setLocations] = useState([]);
  const [view, setView] = useState('trips'); // 'trips' | 'unclaimed' | 'reports'
  const [unclaimedTrips, setUnclaimedTrips] = useState([]);

  // Load locations on mount
  useEffect(() => {
    fetchLocationsApi().then(setLocations).catch(() => {});
  }, []);

  const refreshLocations = useCallback(async () => {
    try {
      const list = await fetchLocationsApi();
      setLocations(list);
    } catch { /* ignore */ }
  }, []);

  // Load vehicles on mount
  useEffect(() => {
    (async () => {
      try {
        let list = await fetchVehiclesApi();
        // First run: no vehicles cached yet — auto-fetch from Cartrack
        if (!list || list.length === 0) {
          const result = await syncVehiclesApi();
          list = result.vehicles || [];
        }
        setVehicles(list);
        // Restore saved selection, or use default vehicle, or fall back to all active
        const saved = loadSavedSelection();
        if (saved && saved.length > 0) {
          const valid = saved.filter(r => list.some(v => v.registration === r));
          setSelectedVehicles(valid.length > 0 ? valid : list.filter(v => v.is_active).map(v => v.registration));
        } else if (user?.default_vehicle && list.some(v => v.registration === user.default_vehicle)) {
          setSelectedVehicles([user.default_vehicle]);
        } else {
          setSelectedVehicles(list.filter(v => v.is_active).map(v => v.registration));
        }
      } catch (err) {
        console.error('Failed to load vehicles:', err.message);
      }
    })();
  }, []);

  // Persist selection changes
  function handleVehicleSelectionChange(regs) {
    setSelectedVehicles(regs);
    saveSelection(regs);
  }

  function handleVehiclesRefresh(list) {
    setVehicles(list);
    // Keep current selection valid
    const validRegs = new Set(list.map(v => v.registration));
    setSelectedVehicles(prev => {
      const filtered = prev.filter(r => validRegs.has(r));
      if (filtered.length === 0) return list.filter(v => v.is_active).map(v => v.registration);
      return filtered;
    });
  }

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

  const loadUnclaimedTrips = useCallback(async (targetDate) => {
    try {
      const data = await fetchUnclaimedTrips(targetDate, targetDate);
      setUnclaimedTrips(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadTrips(date);
    loadUnclaimedTrips(date);
  }, [date, loadTrips, loadUnclaimedTrips]);

  async function handleClaim(tripId) {
    try {
      await claimTrip(tripId);
      await Promise.all([loadTrips(date), loadUnclaimedTrips(date)]);
    } catch (err) {
      setStatus({ message: `Failed to claim trip: ${err.message}`, type: 'error' });
    }
  }

  async function handleRelease(tripId) {
    try {
      await unclaimTrip(tripId);
      await Promise.all([loadTrips(date), loadUnclaimedTrips(date)]);
    } catch (err) {
      setStatus({ message: `Failed to release trip: ${err.message}`, type: 'error' });
    }
  }

  function handleDateChange(newDate) {
    setDate(newDate);
    setSidebarOpen(false);
  }

  function handleSyncResult(result) {
    if (result.error) {
      setStatus({ message: `Sync failed: ${result.error}`, type: 'error' });
    } else {
      let msg = `Synced ${result.synced} trip${result.synced !== 1 ? 's' : ''} from ${result.vehicles || 1} vehicle${(result.vehicles || 1) !== 1 ? 's' : ''}`;
      if (result.errors && result.errors.length > 0) {
        msg += ` (${result.errors.length} vehicle${result.errors.length !== 1 ? 's' : ''} failed)`;
      }
      setStatus({ message: msg, type: result.errors ? 'warning' : 'success' });
      loadTrips(date);
      loadUnclaimedTrips(date);
    }
  }

  function handleTripUpdate(updated) {
    setTrips(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
  }

  // Build registration -> display name lookup
  const vehicleNames = {};
  for (const v of vehicles) {
    vehicleNames[v.registration] = v.description || v.registration;
  }

  // My trips (claimed) — no vehicle filter needed, server returns only mine
  const myTrips = trips;
  const totalKm = myTrips.reduce((s, t) => s + (t.distance_km || 0), 0);
  const businessCount = myTrips.filter(t => t.is_business !== 0).length;
  const privateCount = myTrips.length - businessCount;

  // Group my trips by date
  const grouped = {};
  for (const trip of myTrips) {
    const key = trip.trip_date || date;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(trip);
  }
  const sortedDates = Object.keys(grouped).sort();

  // Group unclaimed trips by date
  const groupedUnclaimed = {};
  for (const trip of unclaimedTrips) {
    const key = trip.trip_date || date;
    if (!groupedUnclaimed[key]) groupedUnclaimed[key] = [];
    groupedUnclaimed[key].push(trip);
  }
  const sortedUnclaimedDates = Object.keys(groupedUnclaimed).sort();

  return (
    <div className="dashboard">
      <Sidebar
        date={date}
        onDateChange={handleDateChange}
        onSynced={handleSyncResult}
        trips={myTrips}
        unclaimedCount={unclaimedTrips.length}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        vehicles={vehicles}
        selectedVehicles={selectedVehicles}
        onVehicleSelectionChange={handleVehicleSelectionChange}
        onVehiclesRefresh={handleVehiclesRefresh}
        view={view}
        onViewChange={setView}
      />

      <main className="main-content">
        {view === 'reports' ? (
          <ReportView />
        ) : view === 'unclaimed' ? (
          <>
            <div className="kpi-row">
              <div className="kpi-card">
                <div className="kpi-label">Unclaimed</div>
                <div className="kpi-value">{unclaimedTrips.length}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Distance</div>
                <div className="kpi-value km">{unclaimedTrips.reduce((s, t) => s + (t.distance_km || 0), 0).toFixed(1)} km</div>
              </div>
            </div>
            {unclaimedTrips.length === 0 && (
              <div className="empty">No unclaimed trips for this date.</div>
            )}
            {sortedUnclaimedDates.map(d => (
              <TripDayGroup
                key={d}
                date={d}
                trips={groupedUnclaimed[d]}
                onTripUpdate={() => {}}
                onTripsReload={() => loadUnclaimedTrips(date)}
                vehicleNames={vehicleNames}
                locations={locations}
                onLocationAdded={refreshLocations}
                claimable={true}
                onTripClaim={handleClaim}
              />
            ))}
          </>
        ) : (
          <>
            <div className="kpi-row">
              <div className="kpi-card">
                <div className="kpi-label">My Trips</div>
                <div className="kpi-value">{myTrips.length}</div>
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
              <div className="empty">No trips claimed for this date. Visit Unallocated to claim trips.</div>
            )}
            {sortedDates.map(d => (
              <TripDayGroup
                key={d}
                date={d}
                trips={grouped[d]}
                onTripUpdate={handleTripUpdate}
                onTripsReload={() => { loadTrips(date); loadUnclaimedTrips(date); }}
                vehicleNames={vehicleNames}
                locations={locations}
                onLocationAdded={refreshLocations}
                onTripRelease={handleRelease}
              />
            ))}
          </>
        )}
      </main>

      <StatusBar message={status.message} type={status.type} />
    </div>
  );
}
