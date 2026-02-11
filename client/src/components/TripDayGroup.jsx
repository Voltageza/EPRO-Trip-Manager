import React, { useState } from 'react';
import TripCard from './TripCard.jsx';
import DayReportSubmit from './DayReportSubmit.jsx';
import { mergeTrips, unmergeTrip } from '../api/tripsApi.js';

export default function TripDayGroup({ date, trips, onTripUpdate, onTripsReload }) {
  const [dragSourceId, setDragSourceId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
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

    setMerging(true);
    setDragSourceId(null);
    setDropTargetId(null);

    try {
      const targetTrip = trips.find(t => t.id === targetTripId);
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
        </div>
      </div>
      <div className="day-progress">
        <div className="day-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className={`trip-list${merging ? ' merging' : ''}`}>
        {trips.map((trip, i) => (
          <TripCard
            key={trip.id}
            trip={trip}
            onUpdate={onTripUpdate}
            onTripsReload={onTripsReload}
            isDragging={dragSourceId === trip.id}
            isDropTarget={dropTargetId === trip.id}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragEnterCard={handleDragEnterCard}
            onDragLeaveCard={handleDragLeaveCard}
            onDropOnCard={handleDropOnCard}
            style={{ '--card-index': i }}
          />
        ))}
      </div>
      <DayReportSubmit date={date} trips={trips} />
    </div>
  );
}
