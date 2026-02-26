import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createManualTrip } from '../api/tripsApi.js';

const DEFAULT_CENTER = [-33.9636, 22.4607]; // George, WC

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cleanNominatim(name) {
  return (name || '')
    .replace(/,?\s*South Africa\s*$/i, '')
    .replace(/,?\s*Western Cape\s*$/i, '')
    .trim();
}

function makeIcon(color) {
  return window.L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.45);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function AddTripModal({ vehicles, defaultDate, onCreated, onClose }) {
  const [form, setForm] = useState({
    registration: vehicles.find(v => v.is_active)?.registration || '',
    trip_date: defaultDate,
    start_time: '',
    end_time: '',
    start_address: '',
    end_address: '',
    start_lat: null,
    start_lng: null,
    end_lat: null,
    end_lng: null,
    distance_km: '',
    duration_minutes: '',
    user_description: '',
    is_business: true,
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);

  // 'start' | 'end' — which point the next map click places
  const [clickMode, setClickMode] = useState('start');

  // Autocomplete
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const [startSearching, setStartSearching] = useState(false);
  const [endSearching, setEndSearching] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  // Refs
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const startWrapRef = useRef(null);
  const endWrapRef = useRef(null);
  const startDebounce = useRef(null);
  const endDebounce = useRef(null);
  const coordsRef = useRef({ start_lat: null, start_lng: null, end_lat: null, end_lng: null });
  // Ref so map click handler always sees current clickMode without re-registering
  const clickModeRef = useRef('start');
  useEffect(() => { clickModeRef.current = clickMode; }, [clickMode]);

  // ── Initialise Leaflet map on mount ────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || !window.L) return;

    // Small delay so the modal's CSS transition has started and the div has layout
    const t = setTimeout(() => {
      if (mapRef.current) return; // already initialised

      const map = window.L.map(mapDivRef.current, { zoomControl: true }).setView(DEFAULT_CENTER, 11);

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Map click → place marker + reverse geocode
      map.on('click', e => {
        const { lat, lng } = e.latlng;
        handleMapClick(lat, lng, clickModeRef.current);
      });

      mapRef.current = map;
      setMapReady(true);
    }, 80);

    return () => clearTimeout(t);
  }, []);

  // Update map cursor to crosshair when a mode is active
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getContainer().style.cursor = clickMode ? 'crosshair' : '';
  }, [clickMode, mapReady]);

  // ── Map click handler ──────────────────────────────────────────────────────
  async function handleMapClick(lat, lng, which) {
    if (!which) return;

    // Place marker immediately
    placeMarker(which, lat, lng);

    // Update coords ref straight away (used in maybeRoute)
    if (which === 'start') {
      coordsRef.current.start_lat = lat;
      coordsRef.current.start_lng = lng;
      setForm(f => ({ ...f, start_lat: lat, start_lng: lng, start_address: 'Locating…' }));
      setClickMode('end'); // auto-advance
    } else {
      coordsRef.current.end_lat = lat;
      coordsRef.current.end_lng = lng;
      setForm(f => ({ ...f, end_lat: lat, end_lng: lng, end_address: 'Locating…' }));
      setClickMode(null);
    }

    // Reverse geocode
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      const address = cleanNominatim(data.display_name) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (which === 'start') setForm(f => ({ ...f, start_address: address }));
      else                   setForm(f => ({ ...f, end_address: address }));
    } catch {
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (which === 'start') setForm(f => ({ ...f, start_address: fallback }));
      else                   setForm(f => ({ ...f, end_address: fallback }));
    }

    // Route once both points set
    const c = coordsRef.current;
    if (c.start_lat && c.end_lat) {
      maybeRoute(c.start_lat, c.start_lng, c.end_lat, c.end_lng);
    }
  }

  // ── Marker helper ──────────────────────────────────────────────────────────
  function placeMarker(which, lat, lng) {
    if (!mapRef.current || !window.L) return;
    const map = mapRef.current;
    const pos = [lat, lng];
    const color = which === 'start' ? '#3b82f6' : '#22c55e';
    if (which === 'start') {
      if (startMarkerRef.current) startMarkerRef.current.setLatLng(pos);
      else startMarkerRef.current = window.L.marker(pos, { icon: makeIcon(color) }).addTo(map);
      map.panTo(pos);
    } else {
      if (endMarkerRef.current) endMarkerRef.current.setLatLng(pos);
      else endMarkerRef.current = window.L.marker(pos, { icon: makeIcon(color) }).addTo(map);
    }
  }

  // ── OSRM route ─────────────────────────────────────────────────────────────
  async function maybeRoute(sLat, sLng, eLat, eLng) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]) {
        const route = data.routes[0];
        const km   = (route.distance / 1000).toFixed(1);
        const mins = Math.round(route.duration / 60);
        setForm(f => ({ ...f, distance_km: km, duration_minutes: mins }));
        setRouteInfo({
          distance: `${km} km`,
          duration: mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`,
        });
        if (mapRef.current && window.L) {
          if (routeLayerRef.current) routeLayerRef.current.remove();
          const latlngs = route.geometry.coordinates.map(([lg, lt]) => [lt, lg]);
          routeLayerRef.current = window.L.polyline(latlngs, {
            color: '#3b82f6', weight: 5, opacity: 0.8,
          }).addTo(mapRef.current);
          mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [32, 32] });
        }
        return;
      }
    } catch { /* fall through */ }

    // Fallback: straight-line
    const km = haversineKm(sLat, sLng, eLat, eLng).toFixed(1);
    setForm(f => ({ ...f, distance_km: km, duration_minutes: '' }));
    setRouteInfo({ distance: `~${km} km`, duration: 'straight-line est.' });
    if (mapRef.current && window.L) {
      if (routeLayerRef.current) routeLayerRef.current.remove();
      routeLayerRef.current = window.L.polyline([[sLat, sLng], [eLat, eLng]], {
        color: '#3b82f6', weight: 3, dashArray: '8 6', opacity: 0.7,
      }).addTo(mapRef.current);
      mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [40, 40] });
    }
  }

  // ── Address search (Nominatim) ─────────────────────────────────────────────
  const searchNominatim = useCallback(async (query, setSuggestions, setSearching) => {
    if (query.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=za`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      setSuggestions(data.map(r => ({
        display: cleanNominatim(r.display_name),
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      })));
    } catch { setSuggestions([]); }
    finally { setSearching(false); }
  }, []);

  function handleStartInput(val) {
    setForm(f => ({ ...f, start_address: val, start_lat: null, start_lng: null }));
    setStartOpen(true);
    clearTimeout(startDebounce.current);
    startDebounce.current = setTimeout(() => searchNominatim(val, setStartSuggestions, setStartSearching), 350);
  }

  function handleEndInput(val) {
    setForm(f => ({ ...f, end_address: val, end_lat: null, end_lng: null }));
    setEndOpen(true);
    clearTimeout(endDebounce.current);
    endDebounce.current = setTimeout(() => searchNominatim(val, setEndSuggestions, setEndSearching), 350);
  }

  function selectSuggestion(which, s) {
    coordsRef.current[`${which}_lat`] = s.lat;
    coordsRef.current[`${which}_lng`] = s.lng;
    setForm(f => ({ ...f,
      [`${which}_address`]: s.display,
      [`${which}_lat`]: s.lat,
      [`${which}_lng`]: s.lng,
    }));
    if (which === 'start') { setStartSuggestions([]); setStartOpen(false); }
    else                   { setEndSuggestions([]);   setEndOpen(false); }

    placeMarker(which, s.lat, s.lng);
    if (which === 'start' && !coordsRef.current.end_lat)   setClickMode('end');
    else if (which === 'end' && !coordsRef.current.start_lat) setClickMode('start');
    else setClickMode(null);

    const c = coordsRef.current;
    if (c.start_lat && c.end_lat) maybeRoute(c.start_lat, c.start_lng, c.end_lat, c.end_lng);
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e) {
      if (startWrapRef.current && !startWrapRef.current.contains(e.target)) setStartOpen(false);
      if (endWrapRef.current   && !endWrapRef.current.contains(e.target))   setEndOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.registration)               return setFormError('Please select a vehicle.');
    if (!form.start_time)                 return setFormError('Start time is required.');
    if (!form.end_time)                   return setFormError('End time is required.');
    if (form.end_time <= form.start_time) return setFormError('End time must be after start time.');
    setSaving(true);
    setFormError('');
    try {
      const trip = await createManualTrip(form);
      onCreated(trip);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const modeLabel = clickMode === 'start'
    ? '🔵 Click map to place start'
    : clickMode === 'end'
      ? '🟢 Click map to place end'
      : null;

  return (
    <div className="atm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="atm-modal">
        <div className="atm-header">
          <h2>Add Manual Trip</h2>
          <button className="atm-close" onClick={onClose}>&times;</button>
        </div>

        <form className="atm-body" onSubmit={handleSubmit}>
          {/* Vehicle + Date */}
          <div className="atm-row">
            <label className="atm-label">
              Vehicle
              <select className="atm-input" value={form.registration} onChange={e => set('registration', e.target.value)} required>
                <option value="">— select vehicle —</option>
                {vehicles.filter(v => v.is_active).map(v => (
                  <option key={v.registration} value={v.registration}>{v.description || v.registration}</option>
                ))}
              </select>
            </label>
            <label className="atm-label">
              Date
              <input type="date" className="atm-input" value={form.trip_date} onChange={e => set('trip_date', e.target.value)} required />
            </label>
          </div>

          {/* Times */}
          <div className="atm-row">
            <label className="atm-label">
              Start Time
              <input type="time" className="atm-input" value={form.start_time} onChange={e => set('start_time', e.target.value)} required />
            </label>
            <label className="atm-label">
              End Time
              <input type="time" className="atm-input" value={form.end_time} onChange={e => set('end_time', e.target.value)} required />
            </label>
          </div>

          {/* Map */}
          <div className="atm-map-wrap">
            <div ref={mapDivRef} className="atm-map always-visible" />
            {modeLabel && <div className="atm-map-hint">{modeLabel}</div>}
          </div>

          {/* Mode buttons */}
          <div className="atm-mode-row">
            <button
              type="button"
              className={`atm-mode-btn start${clickMode === 'start' ? ' active' : ''}${form.start_lat ? ' placed' : ''}`}
              onClick={() => setClickMode(clickMode === 'start' ? null : 'start')}
            >
              🔵 {form.start_lat ? 'Start ✓' : 'Set Start'}
            </button>
            <button
              type="button"
              className={`atm-mode-btn end${clickMode === 'end' ? ' active' : ''}${form.end_lat ? ' placed' : ''}`}
              onClick={() => setClickMode(clickMode === 'end' ? null : 'end')}
            >
              🟢 {form.end_lat ? 'End ✓' : 'Set End'}
            </button>
            {(form.start_lat || form.end_lat) && (
              <button
                type="button"
                className="atm-mode-btn clear"
                onClick={() => {
                  if (startMarkerRef.current) { startMarkerRef.current.remove(); startMarkerRef.current = null; }
                  if (endMarkerRef.current)   { endMarkerRef.current.remove();   endMarkerRef.current = null; }
                  if (routeLayerRef.current)  { routeLayerRef.current.remove();  routeLayerRef.current = null; }
                  coordsRef.current = { start_lat: null, start_lng: null, end_lat: null, end_lng: null };
                  setForm(f => ({ ...f, start_address: '', end_address: '', start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: '', duration_minutes: '' }));
                  setRouteInfo(null);
                  setClickMode('start');
                }}
              >✕ Clear</button>
            )}
          </div>

          {/* Start address */}
          <label className="atm-label">
            Start Address
            <div className="atm-ac-wrap" ref={startWrapRef}>
              <div className="atm-ac-input-row">
                <input
                  type="text" className="atm-input"
                  placeholder="Search or click map…"
                  value={form.start_address}
                  onChange={e => handleStartInput(e.target.value)}
                  onFocus={() => startSuggestions.length > 0 && setStartOpen(true)}
                  autoComplete="off"
                />
                {form.start_lat && <span className="atm-pinned">✓</span>}
                {startSearching && <span className="atm-searching" />}
              </div>
              {startOpen && startSuggestions.length > 0 && (
                <div className="atm-suggestions">
                  {startSuggestions.map((s, i) => (
                    <div key={i} className="atm-suggestion" onMouseDown={e => { e.preventDefault(); selectSuggestion('start', s); }}>
                      {s.display}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </label>

          {/* End address */}
          <label className="atm-label">
            End Address
            <div className="atm-ac-wrap" ref={endWrapRef}>
              <div className="atm-ac-input-row">
                <input
                  type="text" className="atm-input"
                  placeholder="Search or click map…"
                  value={form.end_address}
                  onChange={e => handleEndInput(e.target.value)}
                  onFocus={() => endSuggestions.length > 0 && setEndOpen(true)}
                  autoComplete="off"
                />
                {form.end_lat && <span className="atm-pinned">✓</span>}
                {endSearching && <span className="atm-searching" />}
              </div>
              {endOpen && endSuggestions.length > 0 && (
                <div className="atm-suggestions">
                  {endSuggestions.map((s, i) => (
                    <div key={i} className="atm-suggestion" onMouseDown={e => { e.preventDefault(); selectSuggestion('end', s); }}>
                      {s.display}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </label>

          {/* Route info */}
          {routeInfo && (
            <div className="atm-route-info">
              <span className="atm-route-chip">🛣 {routeInfo.distance}</span>
              <span className="atm-route-chip">⏱ {routeInfo.duration}</span>
              <span className="atm-route-note">Auto-filled — edit if needed</span>
            </div>
          )}

          {/* Distance + type */}
          <div className="atm-row">
            <label className="atm-label">
              Distance (km)
              <input type="number" className="atm-input" placeholder="Auto from map" min="0" step="0.1"
                value={form.distance_km} onChange={e => set('distance_km', e.target.value)} />
            </label>
            <label className="atm-label">
              Trip Type
              <div className="atm-toggle">
                <button type="button" className={`atm-toggle-btn${form.is_business ? ' active' : ''}`} onClick={() => set('is_business', true)}>Business</button>
                <button type="button" className={`atm-toggle-btn${!form.is_business ? ' active private' : ''}`} onClick={() => set('is_business', false)}>Private</button>
              </div>
            </label>
          </div>

          {/* Description */}
          <label className="atm-label">
            What was this trip for?
            <input type="text" className="atm-input" placeholder="Description / purpose"
              value={form.user_description} onChange={e => set('user_description', e.target.value)} />
          </label>

          {formError && <div className="atm-error">{formError}</div>}

          <div className="atm-actions">
            <button type="button" className="atm-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="atm-btn-save" disabled={saving}>{saving ? 'Adding…' : 'Add Trip'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
