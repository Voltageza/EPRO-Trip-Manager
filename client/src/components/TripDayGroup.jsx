import React from 'react';
import TripCard from './TripCard.jsx';
import DayReportSubmit from './DayReportSubmit.jsx';

export default function TripDayGroup({ date, trips, onTripUpdate }) {
  const formatted = new Date(date + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const filled = trips.filter(t => t.user_description).length;
  const totalKm = trips.reduce((s, t) => s + (t.distance_km || 0), 0);

  return (
    <div className="day-group">
      <div className="day-header">
        <h2>{formatted}</h2>
        <div className="day-header-stats">
          <span className="day-stat">{totalKm.toFixed(1)} km</span>
          <span className="day-count">{filled}/{trips.length} described</span>
        </div>
      </div>
      <div className="trip-list">
        {trips.map((trip, i) => (
          <TripCard
            key={trip.id}
            trip={trip}
            onUpdate={onTripUpdate}
            style={{ '--card-index': i }}
          />
        ))}
      </div>
      <DayReportSubmit date={date} trips={trips} />
    </div>
  );
}
