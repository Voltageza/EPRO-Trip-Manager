import React, { useState, useEffect } from 'react';
import { submitDailyReport, getDailyReport } from '../api/tripsApi.js';

export default function DayReportSubmit({ date, trips }) {
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    getDailyReport(date).then(r => {
      if (r.exists) {
        setReport(r);
        setNotes(r.notes || '');
        setSubmitted(true);
      }
    }).catch(() => {});
  }, [date]);

  const totalKm = trips.reduce((s, t) => s + (t.distance_km || 0), 0);
  const businessCount = trips.filter(t => t.is_business !== 0).length;
  const privateCount = trips.length - businessCount;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const r = await submitDailyReport(date, notes);
      setReport(r);
      setSubmitted(true);
    } catch {
      // keep form active
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`day-report ${submitted ? 'day-report--submitted' : ''}`}>
      <div className="day-report-header">Day Summary</div>
      <div className="day-report-stats">
        <span className="stat-badge">
          <span className="stat-value">{trips.length}</span> trips
        </span>
        <span className="stat-badge">
          <span className="stat-value">{totalKm.toFixed(1)}</span> km
        </span>
        <span className="stat-badge business">
          <span className="stat-value">{businessCount}</span> business
        </span>
        <span className="stat-badge private">
          <span className="stat-value">{privateCount}</span> private
        </span>
      </div>

      <div className="day-report-notes">
        <textarea
          placeholder="Add notes for this day (optional)..."
          value={notes}
          onChange={e => { setNotes(e.target.value); setSubmitted(false); }}
          rows={2}
        />
      </div>

      <div className="day-report-actions">
        {submitted && <span className="day-report-saved">Submitted</span>}
        <button
          className="day-report-btn"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : submitted ? 'Update Report' : 'Submit Day Report'}
        </button>
      </div>
    </div>
  );
}
