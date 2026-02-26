import React, { useState } from 'react';
import TripCard from './TripCard.jsx';
import DayReportSubmit from './DayReportSubmit.jsx';
import { mergeTrips, unmergeTrip, sendWeeklyReportApi } from '../api/tripsApi.js';

export default function TripDayGroup({ date, trips, onTripUpdate, onTripsReload, multiVehicleDay, vehicleNames = {}, locations = [], onLocationAdded, claimable = false, onTripClaim, onTripRelease }) {
  const [dragSourceId, setDragSourceId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [merging, setMerging] = useState(false);
  const [emailState, setEmailState] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'

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

  // Vehicle breakdown for multi-vehicle days
  const vehicleCounts = {};
  for (const t of trips) {
    vehicleCounts[t.registration] = (vehicleCounts[t.registration] || 0) + 1;
  }
  const vehicleRegs = Object.keys(vehicleCounts);
  const showVehicleBadge = vehicleRegs.length > 1;

  function handleDragStart(tripId) {
    setDragSourceId(tripId);
  }

  function handleDragEnd() {
    setDragSourceId(null);
    setDropTargetId(null);
  }

  function handleDragEnterCard(tripId) {
    if (tripId !== dragSourceId) {
      setDropTargetId(tripId);
    }
  }

  function handleDragLeaveCard(tripId) {
    if (dropTargetId === tripId) {
      setDropTargetId(null);
    }
  }

  async function handleDropOnCard(targetTripId) {
    if (!dragSourceId || dragSourceId === targetTripId) return;

    // Prevent cross-vehicle merge via drag
    const sourceTrip = trips.find(t => t.id === dragSourceId);
    const targetTrip = trips.find(t => t.id === targetTripId);
    if (sourceTrip && targetTrip && sourceTrip.registration !== targetTrip.registration) {
      alert('Cannot merge trips from different vehicles');
      setDragSourceId(null);
      setDropTargetId(null);
      return;
    }

    setMerging(true);
    setDragSourceId(null);
    setDropTargetId(null);

    try {
      const isMergedPrimary = targetTrip?.merged_from && targetTrip.merged_from.length > 0;

      if (isMergedPrimary) {
        // Unmerge first, then re-merge with the dragged trip included
        const previouslyAbsorbed = [...targetTrip.merged_from];
        await unmergeTrip(targetTripId);
        await mergeTrips([targetTripId, ...previouslyAbsorbed, dragSourceId]);
      } else {
        await mergeTrips([dragSourceId, targetTripId]);
      }
      onTripsReload();
    } catch (err) {
      alert('Merge failed: ' + err.message);
      onTripsReload();
    } finally {
      setMerging(false);
    }
  }

  async function handleEmail() {
    setEmailState('sending');
    try {
      await sendWeeklyReportApi(date, date);
      setEmailState('sent');
      setTimeout(() => setEmailState('idle'), 3000);
    } catch {
      setEmailState('error');
      setTimeout(() => setEmailState('idle'), 3000);
    }
  }

  function handlePrint() {
    const dateObj2 = new Date(date + 'T00:00:00');
    const fullDate = dateObj2.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const totalKm = trips.reduce((s, t) => s + (t.distance_km || 0), 0);
    const businessCount = trips.filter(t => t.is_business !== 0).length;
    const privateCount = trips.length - businessCount;

    const rows = trips.map((t, i) => {
      const start = t.start_time ? new Date(t.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';
      const end = t.end_time ? new Date(t.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';
      const km = t.distance_km ? t.distance_km.toFixed(1) + ' km' : '—';
      const type = t.is_business !== 0 ? 'Business' : 'Private';
      const typeColor = t.is_business !== 0 ? '#2563eb' : '#7c3aed';
      const desc = [t.customer_name, t.user_description].filter(Boolean).join(' — ') || '—';
      const mergedNote = t.merged_from?.length > 0 ? ` <small style="color:#888">(${t.merged_from.length + 1} merged)</small>` : '';
      const vehicleName = vehicleNames[t.registration] || t.registration;
      return `<tr>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#666;">${i + 1}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">${start} — ${end}${mergedNote}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">${km}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;color:${typeColor}">${type}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">${vehicleName}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">${desc}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>Trip Report — ${fullDate}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#222;padding:28px;font-size:13px}
    h1{font-size:20px;font-weight:700;margin-bottom:4px}
    .sub{color:#666;margin-bottom:20px;font-size:13px}
    table{width:100%;border-collapse:collapse}
    th{background:#f3f4f6;text-align:left;padding:9px 10px;border-bottom:2px solid #d1d5db;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    .summary{margin-top:18px;padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:13px}
    @media print{body{padding:16px}}</style></head><body>
    <h1>Trip Report</h1>
    <p class="sub">${fullDate}</p>
    <table>
      <thead><tr>
        <th>#</th><th>Time</th><th>Distance</th><th>Type</th><th>Vehicle</th><th>Description / Customer</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="summary">
      <strong>${trips.length}</strong> trip${trips.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
      <strong>${totalKm.toFixed(1)} km</strong> &nbsp;·&nbsp;
      <strong style="color:#2563eb">${businessCount} business</strong> &nbsp;·&nbsp;
      <strong style="color:#7c3aed">${privateCount} private</strong>
    </div>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }

  return (
    <div className="day-group">
      <div className="day-header">
        <div className="day-header-left">
          <span className="day-weekday">{weekday}</span>
          <h2>{formatted}</h2>
        </div>
        <div className="day-header-stats">
          <span className="day-stat">{totalKm.toFixed(1)} km</span>
          <span className="day-count">{filled}/{trips.length} described</span>
          <div className="day-actions">
            <button
              className="day-action-btn"
              onClick={handlePrint}
              title="Print day report"
            >⎙ Print</button>
            <button
              className={`day-action-btn${emailState === 'sent' ? ' day-action-btn--success' : emailState === 'error' ? ' day-action-btn--error' : ''}`}
              onClick={handleEmail}
              disabled={emailState === 'sending'}
              title="Email day report"
            >
              {emailState === 'sending' ? '...' : emailState === 'sent' ? '✓ Sent' : emailState === 'error' ? '✗ Failed' : '✉ Email'}
            </button>
          </div>
        </div>
      </div>
      <div className="day-progress">
        <div className="day-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {showVehicleBadge && (
        <div className="vehicle-summary">
          {vehicleRegs.map(reg => (
            <span key={reg} className="vehicle-summary-chip">
              {vehicleNames[reg] || reg}: {vehicleCounts[reg]} trip{vehicleCounts[reg] !== 1 ? 's' : ''}
            </span>
          ))}
        </div>
      )}

      <div className={`trip-list${merging ? ' merging' : ''}`}>
        {trips.map((trip, i) => (
          <TripCard
            key={trip.id}
            trip={trip}
            onUpdate={onTripUpdate}
            onTripsReload={onTripsReload}
            showVehicleBadge={showVehicleBadge || claimable}
            vehicleNames={vehicleNames}
            locations={locations}
            onLocationAdded={onLocationAdded}
            isDragging={dragSourceId === trip.id}
            isDropTarget={dropTargetId === trip.id}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragEnterCard={handleDragEnterCard}
            onDragLeaveCard={handleDragLeaveCard}
            onDropOnCard={handleDropOnCard}
            style={{ '--card-index': i }}
            claimable={claimable}
            onClaim={onTripClaim}
            onRelease={onTripRelease}
          />
        ))}
      </div>
      <DayReportSubmit date={date} trips={trips} />
    </div>
  );
}
