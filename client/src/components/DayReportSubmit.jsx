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
      <div className="day-report-stats">
        <div className="stat-item">
          <span className="stat-value">{trips.length}</span>
          <span className="stat-label">Trips</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{totalKm.toFixed(1)}</span>
          <span className="stat-label">KM</span>
        </div>
        <div className="stat-item stat-business">
          <span className="stat-value">{businessCount}</span>
          <span className="stat-label">Business</span>
        </div>
        <div className="stat-item stat-private">
          <span className="stat-value">{privateCount}</span>
          <span className="stat-label">Private</span>
        </div>
      </div>

      <div className="day-report-notes">
        <textarea
          placeholder="Day notes (optional)"
          value={notes}
          onChange={e => { setNotes(e.target.value); setSubmitted(false); }}
          rows={2}
        />
      </div>

      <div className="day-report-actions">
        <button
          className="day-report-btn"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : submitted ? 'Update Report' : 'Submit Day Report'}
        </button>
        {submitted && <span className="day-report-saved">Submitted</span>}
      </div>
    </div>
  );
}
