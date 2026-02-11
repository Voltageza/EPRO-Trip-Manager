import React, { useState } from 'react';
import TripCard from './TripCard.jsx';
import DayReportSubmit from './DayReportSubmit.jsx';
import { mergeTrips } from '../api/tripsApi.js';

export default function TripDayGroup({ date, trips, onTripUpdate, onTripsReload }) {
  const [mergeMode, setMergeMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [merging, setMerging] = useState(false);

  const dateObj = new Date(date + 'T00:00:00');
  const weekday = dateObj.toLocaleDateString('en-ZA', { weekday: 'long' });
  const formatted = dateObj.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const filled = trips.filter(t => t.user_description).length;
  const totalKm = trips.reduce((s, t) => s + (t.distance_km || 0), 0);
  const progress = trips.length > 0 ? (filled / trips.length) * 100 : 0;

  function handleToggleSelect(tripId) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
  }

  async function handleMerge() {
    if (selected.size < 2) return;
    setMerging(true);
    try {
      await mergeTrips([...selected]);
      setMergeMode(false);
      setSelected(new Set());
      onTripsReload();
    } catch (err) {
      alert('Merge failed: ' + err.message);
    } finally {
      setMerging(false);
    }
  }

  function handleCancelMerge() {
    setMergeMode(false);
    setSelected(new Set());
  }

  return (
    <div className="day-group">
      <div className="day-header">
        <div className="day-header-left">
          <span className="day-weekday">{weekday}</span>
          <h2>{formatted}</h2>
        </div>
        <div className="day-header-stats">
          {!mergeMode && (
            <>
              <span className="day-stat">{totalKm.toFixed(1)} km</span>
              <span className="day-count">{filled}/{trips.length} described</span>
              {trips.length >= 2 && (
                <button className="merge-btn" onClick={() => setMergeMode(true)}>
                  Merge Trips
                </button>
              )}
            </>
          )}
          {mergeMode && (
            <div className="merge-controls">
              <button
                className="merge-confirm-btn"
                onClick={handleMerge}
                disabled={selected.size < 2 || merging}
              >
                {merging ? 'Merging...' : `Merge ${selected.size} Trip${selected.size !== 1 ? 's' : ''}`}
              </button>
              <button className="merge-cancel-btn" onClick={handleCancelMerge} disabled={merging}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="day-progress">
        <div className="day-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="trip-list">
        {trips.map((trip, i) => (
          <TripCard
            key={trip.id}
            trip={trip}
            onUpdate={onTripUpdate}
            onTripsReload={onTripsReload}
            mergeMode={mergeMode}
            selected={selected.has(trip.id)}
            onToggleSelect={() => handleToggleSelect(trip.id)}
            style={{ '--card-index': i }}
          />
        ))}
      </div>
      <DayReportSubmit date={date} trips={trips} />
    </div>
  );
}
