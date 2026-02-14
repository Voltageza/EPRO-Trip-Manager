import React, { useState, useRef } from 'react';
import { saveDescription, unmergeTrip, createLocationApi, fetchOpenJobs, linkTripToJob, unlinkTripFromJob } from '../api/tripsApi.js';
import BusinessToggle from './BusinessToggle.jsx';
import SparesInput from './SparesInput.jsx';
import JobLinker from './JobLinker.jsx';

// Haversine distance in metres between two lat/lng pairs
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Find the closest saved location within radius (metres)
function findNearbyLocation(lat, lng, locations, radius = 100) {
  if (lat == null || lng == null || !locations.length) return null;
  let best = null;
  let bestDist = radius;
  for (const loc of locations) {
    const d = haversineMetres(lat, lng, loc.lat, loc.lng);
    if (d < bestDist) {
      best = loc;
      bestDist = d;
    }
  }
  return best;
}

function AddressWithLocation({
  addr, geoName, lat, lng, locations, endpoint,
  namingEndpoint, locationName, savingLocation,
  onStartNaming, onCancelNaming, onNameChange, onSaveLocation,
}) {
  const savedLoc = !geoName ? findNearbyLocation(lat, lng, locations) : null;
  const hasCoords = lat != null && lng != null;
  const isNaming = namingEndpoint === endpoint;

  return (
    <div className="trip-address">
      {addr}
      {geoName && <span className="geo-name">{geoName}</span>}
      {!geoName && savedLoc && <span className="geo-name">{savedLoc.name}</span>}
      {!geoName && !savedLoc && hasCoords && (
        <>
          <a
            className="geo-link"
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Maps"
            onClick={e => e.stopPropagation()}
          >
            &#x1F4CD;
          </a>
          {!isNaming && (
            <button
              className="geo-add-btn"
              title="Name this location"
              onClick={e => { e.stopPropagation(); onStartNaming(endpoint); }}
            >+</button>
          )}
          {isNaming && (
            <span className="geo-add-form" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Location name..."
                value={locationName}
                onChange={e => onNameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSaveLocation(endpoint);
                  if (e.key === 'Escape') onCancelNaming();
                }}
                autoFocus
              />
              <button onClick={() => onSaveLocation(endpoint)} disabled={savingLocation || !locationName.trim()}>
                {savingLocation ? '...' : 'Save'}
              </button>
              <button className="geo-cancel-btn" onClick={onCancelNaming}>&times;</button>
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default function TripCard({
  trip, onUpdate, onTripsReload, style,
  showVehicleBadge, vehicleNames = {},
  locations = [], onLocationAdded,
  isDragging, isDropTarget,
  onDragStart, onDragEnd, onDragEnterCard, onDragLeaveCard, onDropOnCard,
}) {
  const [description, setDescription] = useState(trip.user_description || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [unmerging, setUnmerging] = useState(false);
  const [namingEndpoint, setNamingEndpoint] = useState(null); // 'start' | 'end' | null
  const [locationName, setLocationName] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
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

  async function handleSaveLocation(endpoint) {
    const lat = endpoint === 'start' ? trip.start_lat : trip.end_lat;
    const lng = endpoint === 'start' ? trip.start_lng : trip.end_lng;
    if (!locationName.trim() || lat == null || lng == null) return;
    setSavingLocation(true);
    try {
      await createLocationApi(locationName.trim(), lat, lng);
      setNamingEndpoint(null);
      setLocationName('');
      if (onLocationAdded) onLocationAdded();
    } catch { /* keep form open for retry */ }
    finally { setSavingLocation(false); }
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

  // Clean addresses: strip region/country suffixes, add geofence name
  const raw = trip.raw_json ? (typeof trip.raw_json === 'string' ? JSON.parse(trip.raw_json) : trip.raw_json) : {};
  function cleanAddress(addr) {
    return (addr || 'Unknown')
      .replace(/, Western Cape, South Africa$/i, '')
      .replace(/, South Africa$/i, '')
      .replace(/, Western Cape$/i, '');
  }
  const startAddr = cleanAddress(trip.start_address);
  const endAddr = cleanAddress(trip.end_address);
  const startGeo = raw.start_geofence_name || '';
  const endGeo = raw.end_geofence_name || '';

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
              <AddressWithLocation
                addr={startAddr}
                geoName={startGeo}
                lat={trip.start_lat}
                lng={trip.start_lng}
                locations={locations}
                endpoint="start"
                namingEndpoint={namingEndpoint}
                locationName={locationName}
                savingLocation={savingLocation}
                onStartNaming={(ep) => { setNamingEndpoint(ep); setLocationName(''); }}
                onCancelNaming={() => setNamingEndpoint(null)}
                onNameChange={setLocationName}
                onSaveLocation={handleSaveLocation}
              />
              <AddressWithLocation
                addr={endAddr}
                geoName={endGeo}
                lat={trip.end_lat}
                lng={trip.end_lng}
                locations={locations}
                endpoint="end"
                namingEndpoint={namingEndpoint}
                locationName={locationName}
                savingLocation={savingLocation}
                onStartNaming={(ep) => { setNamingEndpoint(ep); setLocationName(''); }}
                onCancelNaming={() => setNamingEndpoint(null)}
                onNameChange={setLocationName}
                onSaveLocation={handleSaveLocation}
              />
            </div>
          </div>

          <SparesInput trip={trip} onUpdate={onUpdate} />

          <JobLinker trip={trip} onUpdate={onUpdate} onTripsReload={onTripsReload} />

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
