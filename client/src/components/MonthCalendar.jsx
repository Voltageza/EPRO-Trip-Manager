import React, { useState, useEffect } from 'react';
import { fetchMonthReports } from '../api/tripsApi.js';

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function MonthCalendar({ selectedDate, onDateSelect }) {
  const today = new Date().toISOString().slice(0, 10);
  const [viewYear, setViewYear] = useState(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date();
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date();
    return d.getMonth() + 1; // 1-based
  });
  const [submittedDates, setSubmittedDates] = useState(new Set());

  useEffect(() => {
    fetchMonthReports(viewYear, viewMonth)
      .then(dates => setSubmittedDates(new Set(dates)))
      .catch(() => setSubmittedDates(new Set()));
  }, [viewYear, viewMonth]);

  // When selectedDate changes, keep calendar in sync if it moves to a different month
  useEffect(() => {
    if (!selectedDate) return;
    const d = new Date(selectedDate + 'T00:00:00');
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  }, [selectedDate]);

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // Build calendar grid (Monday-first)
  function buildGrid() {
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    // Monday=0 offset
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }

  function dateStr(day) {
    return `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const cells = buildGrid();

  return (
    <div className="month-calendar">
      <div className="cal-header">
        <button className="cal-nav" onClick={prevMonth} title="Previous month">‹</button>
        <span className="cal-title">{MONTH_NAMES[viewMonth - 1]} {viewYear}</span>
        <button className="cal-nav" onClick={nextMonth} title="Next month">›</button>
      </div>

      <div className="cal-grid">
        {DAY_LABELS.map(d => (
          <div key={d} className="cal-day-label">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="cal-cell cal-cell--empty" />;
          const ds = dateStr(day);
          const isSelected = ds === selectedDate;
          const isToday = ds === today;
          const isSubmitted = submittedDates.has(ds);
          const isFuture = ds > today;
          return (
            <div
              key={ds}
              className={[
                'cal-cell',
                isSelected ? 'cal-cell--selected' : '',
                isToday && !isSelected ? 'cal-cell--today' : '',
                isFuture ? 'cal-cell--future' : '',
              ].join(' ')}
              onClick={() => !isFuture && onDateSelect(ds)}
              title={isSubmitted ? 'Day submitted' : ''}
            >
              <span className="cal-day-num">{day}</span>
              {isSubmitted && <span className="cal-dot" />}
            </div>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="cal-dot" /> Submitted
      </div>
    </div>
  );
}
