import React, { useState, useRef } from 'react';
import { saveDescription } from '../api/tripsApi.js';
import BusinessToggle from './BusinessToggle.jsx';
import SparesInput from './SparesInput.jsx';

export default function TripCard({ trip, onUpdate, style }) {
  const [description, setDescription] = useState(trip.user_description || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef(null);

  const dirty = description !== (trip.user_description || '');
  const isBusiness = trip.is_business !== 0;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await saveDescription(trip.id, description);
      onUpdate(updated);
      setSaved(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch {
      // keep dirty state so user can retry
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  }

  const startTime = trip.start_time
    ? new Date(trip.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    : '';
  const endTime = trip.end_time
    ? new Date(trip.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`trip-card ${description ? 'filled' : 'unfilled'} ${isBusiness ? 'trip-business' : 'trip-private'}`} style={style}>
      <div className="trip-header">
        <div className="trip-header-left">
          <span className="trip-time">{startTime} — {endTime}</span>
          <div className="trip-badges">
            {trip.distance_km != null && (
              <span className="trip-badge">{trip.distance_km.toFixed(1)} km</span>
            )}
            {trip.duration_minutes != null && (
              <span className="trip-badge">{Math.round(trip.duration_minutes)} min</span>
            )}
            {trip.max_speed != null && (
              <span className="trip-badge">Max {Math.round(trip.max_speed)} km/h</span>
            )}
          </div>
        </div>
        <BusinessToggle trip={trip} onUpdate={onUpdate} />
      </div>

      <div className="trip-route">
        <div className="route-timeline">
          <div className="route-dot start"></div>
          <div className="route-line"></div>
          <div className="route-dot end"></div>
        </div>
        <div className="route-addresses">
          <div className="trip-address">{trip.start_address || 'Unknown'}</div>
          <div className="trip-address">{trip.end_address || 'Unknown'}</div>
        </div>
      </div>

      <SparesInput trip={trip} onUpdate={onUpdate} />

      <div className="trip-description">
        <textarea
          placeholder="What was this trip for?"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <div className="trip-actions">
          <button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && <span className="saved-indicator">Saved</span>}
        </div>
      </div>
    </div>
  );
}
