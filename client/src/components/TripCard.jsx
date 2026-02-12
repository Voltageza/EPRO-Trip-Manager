import React, { useState, useRef } from 'react';
import { saveDescription, unmergeTrip } from '../api/tripsApi.js';
import BusinessToggle from './BusinessToggle.jsx';
import SparesInput from './SparesInput.jsx';

export default function TripCard({
  trip, onUpdate, onTripsReload, style,
  showVehicleBadge, vehicleNames = {},
  isDragging, isDropTarget,
  onDragStart, onDragEnd, onDragEnterCard, onDragLeaveCard, onDropOnCard,
}) {
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
    setExpanded(e => !e);
  }

  // Drag event handlers
  function handleNativeDragStart(e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', trip.id);
    // Use setTimeout so the browser captures the drag ghost at full opacity
    setTimeout(() => onDragStart(trip.id), 0);
  }

  function handleNativeDragEnd() {
    onDragEnd();
  }

  function handleNativeDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleNativeDragEnter(e) {
    e.preventDefault();
    onDragEnterCard(trip.id);
  }

  function handleNativeDragLeave(e) {
    // Only trigger if we're actually leaving this card, not entering a child
    if (!e.currentTarget.contains(e.relatedTarget)) {
      onDragLeaveCard(trip.id);
    }
  }

  function handleNativeDrop(e) {
    e.preventDefault();
    onDropOnCard(trip.id);
  }

  const startTime = trip.start_time
    ? new Date(trip.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    : '';
  const endTime = trip.end_time
    ? new Date(trip.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    : '';

  const cardClass = [
    'trip-card',
    expanded && 'expanded',
    isDragging && 'dragging',
    isDropTarget && 'drop-target',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClass}
      style={style}
      draggable={!expanded}
      onDragStart={handleNativeDragStart}
      onDragEnd={handleNativeDragEnd}
      onDragOver={handleNativeDragOver}
      onDragEnter={handleNativeDragEnter}
      onDragLeave={handleNativeDragLeave}
      onDrop={handleNativeDrop}
    >
      <div className="trip-card-header" onClick={handleHeaderClick}>
        <div className="trip-header-left">
          <span className="drag-handle" title="Drag to merge">&#x2630;</span>
          <span className={`trip-filled-dot ${isFilled ? 'filled' : 'unfilled'}`} />
          <span className="trip-time">{startTime} — {endTime}</span>
          <div className="trip-badges">
            {showVehicleBadge && (
              <span className="vehicle-badge">{vehicleNames[trip.registration] || trip.registration}</span>
            )}
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
          <BusinessToggle trip={trip} onUpdate={onUpdate} />
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
