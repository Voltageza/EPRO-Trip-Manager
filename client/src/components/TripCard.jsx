import React, { useState, useRef } from 'react';
import { saveDescription, unmergeTrip } from '../api/tripsApi.js';
import BusinessToggle from './BusinessToggle.jsx';
import SparesInput from './SparesInput.jsx';

export default function TripCard({ trip, onUpdate, onTripsReload, mergeMode, selected, onToggleSelect, style }) {
  const [description, setDescription] = useState(trip.user_description || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [unmerging, setUnmerging] = useState(false);
  const timerRef = useRef(null);

  const dirty = description !== (trip.user_description || '');
  const isFilled = !!trip.user_description;
  const isMergedPrimary = trip.merged_from && trip.merged_from.length > 0;

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

  async function handleUnmerge() {
    setUnmerging(true);
    try {
      await unmergeTrip(trip.id);
      onTripsReload();
    } catch (err) {
      alert('Unmerge failed: ' + err.message);
    } finally {
      setUnmerging(false);
    }
  }

  function handleHeaderClick() {
    if (mergeMode) {
      onToggleSelect();
    } else {
      setExpanded(e => !e);
    }
  }

  const startTime = trip.start_time
    ? new Date(trip.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    : '';
  const endTime = trip.end_time
    ? new Date(trip.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`trip-card ${expanded ? 'expanded' : ''} ${mergeMode && selected ? 'selected' : ''}`} style={style}>
      <div className="trip-card-header" onClick={handleHeaderClick}>
        <div className="trip-header-left">
          {mergeMode && (
            <input
              type="checkbox"
              className="merge-checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={e => e.stopPropagation()}
            />
          )}
          <span className={`trip-filled-dot ${isFilled ? 'filled' : 'unfilled'}`} />
          <span className="trip-time">{startTime} — {endTime}</span>
          <div className="trip-badges">
            {trip.distance_km != null && (
              <span className="trip-badge">{trip.distance_km.toFixed(1)} km</span>
            )}
            {trip.duration_minutes != null && (
              <span className="trip-badge">{Math.round(trip.duration_minutes)} min</span>
            )}
            {isMergedPrimary && (
              <span className="merged-badge">{trip.merged_from.length + 1} trips merged</span>
            )}
          </div>
        </div>
        <div className="trip-card-right">
          {!mergeMode && <BusinessToggle trip={trip} onUpdate={onUpdate} />}
          <span className="trip-expand-icon">{'\u25BC'}</span>
        </div>
      </div>

      <div className="trip-card-body">
        <div className="trip-card-body-inner">
          {isMergedPrimary && (
            <div className="merge-info">
              <span>{trip.merged_from.length + 1} trips merged into this trip</span>
              <button className="unmerge-btn" onClick={handleUnmerge} disabled={unmerging}>
                {unmerging ? 'Unmerging...' : 'Unmerge'}
              </button>
            </div>
          )}

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
            <div className="trip-desc-row">
              <textarea
                placeholder="What was this trip for?"
                value={description}
                onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
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
        </div>
      </div>
    </div>
  );
}
