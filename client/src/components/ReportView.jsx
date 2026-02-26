import React, { useState, useRef } from 'react';
import {
  previewWeeklyReport, sendWeeklyReportApi,
  previewPrivateReport, sendPrivateReportApi,
} from '../api/tripsApi.js';

function getLastMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff - 7);
  return d.toISOString().slice(0, 10);
}

function getLastSunday() {
  const mon = new Date(getLastMonday());
  mon.setDate(mon.getDate() + 6);
  return mon.toISOString().slice(0, 10);
}

export default function ReportView() {
  const [reportType, setReportType] = useState('business'); // 'business' | 'private'
  const [from, setFrom] = useState(getLastMonday);
  const [to, setTo] = useState(getLastSunday);
  const [html, setHtml] = useState('');
  const [totalTrips, setTotalTrips] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState({ message: '', type: '' });
  const previewRef = useRef(null);

  const isBusiness = reportType === 'business';

  function handleTypeChange(type) {
    setReportType(type);
    setHtml('');
    setStatus({ message: '', type: '' });
    setTotalTrips(0);
  }

  async function handlePreview() {
    setLoading(true);
    setStatus({ message: '', type: '' });
    setHtml('');
    try {
      const result = isBusiness
        ? await previewWeeklyReport(from, to)
        : await previewPrivateReport(from, to);
      const label = isBusiness ? 'business' : 'private';
      if (!result.html) {
        setStatus({ message: `No ${label} trips found for ${from} to ${to}.`, type: 'warning' });
        setTotalTrips(0);
      } else {
        setHtml(result.html);
        setTotalTrips(result.totalTrips);
        setStatus({
          message: `Preview generated: ${result.totalTrips} ${label} trip${result.totalTrips !== 1 ? 's' : ''}.`,
          type: 'success',
        });
      }
    } catch (err) {
      setStatus({ message: `Preview failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!previewRef.current) return;
    const editedHtml = previewRef.current.innerHTML;
    setSending(true);
    setStatus({ message: '', type: '' });
    try {
      const result = isBusiness
        ? await sendWeeklyReportApi(from, to, editedHtml)
        : await sendPrivateReportApi(from, to, editedHtml);
      if (result.sent) {
        setStatus({
          message: `Report emailed successfully (${result.totalTrips} trips, ${result.from} to ${result.to}).`,
          type: 'success',
        });
      } else {
        setStatus({ message: `Report not sent: ${result.reason}`, type: 'warning' });
      }
    } catch (err) {
      setStatus({ message: `Send failed: ${err.message}`, type: 'error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="report-view">
      <h2 className="report-view-title">Weekly Report</h2>

      <div className="report-type-toggle">
        <button
          className={`report-type-btn${isBusiness ? ' active' : ''}`}
          onClick={() => handleTypeChange('business')}
        >
          Business Trips
        </button>
        <button
          className={`report-type-btn${!isBusiness ? ' active' : ''}`}
          onClick={() => handleTypeChange('private')}
        >
          Private Trips
        </button>
      </div>

      <div className="report-controls">
        <div className="report-date-range">
          <label className="report-label">
            From
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="report-date-input" />
          </label>
          <label className="report-label">
            To
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="report-date-input" />
          </label>
        </div>
        <button className="report-btn report-btn-preview" onClick={handlePreview} disabled={loading || sending}>
          {loading ? 'Generating...' : 'Generate Preview'}
        </button>
      </div>

      {status.message && (
        <div className={`report-status report-status-${status.type}`}>
          {status.message}
        </div>
      )}

      {html && (
        <>
          <div className="report-preview-label">Preview (click to edit)</div>
          <div
            ref={previewRef}
            className="report-preview"
            contentEditable
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div className="report-actions">
            <button className="report-btn report-btn-send" onClick={handleSend} disabled={sending || loading}>
              {sending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
