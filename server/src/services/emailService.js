import nodemailer from 'nodemailer';
import config from '../config.js';
import db from '../db.js';
import { yesterday } from './tripSync.js';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: false,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

const getUnfilledTrips = db.prepare(`
  SELECT id, start_time, end_time, start_address, end_address, distance_km
  FROM trips
  WHERE trip_date = ? AND (user_description IS NULL OR user_description = '') AND merged_into IS NULL
  ORDER BY start_time
`);

const getTripsForDateRange = db.prepare(`
  SELECT * FROM trips
  WHERE trip_date >= ? AND trip_date <= ? AND merged_into IS NULL
  ORDER BY trip_date ASC, start_time ASC
`);

const getSparesForTrip = db.prepare(`
  SELECT * FROM trip_spares WHERE trip_id = ? ORDER BY created_at ASC
`);

const getReportForDate = db.prepare(`
  SELECT * FROM daily_reports WHERE report_date = ?
`);

/**
 * Send an email reminder for trips from a given date that lack descriptions.
 */
export async function sendReminder(date) {
  const targetDate = date || yesterday();
  const trips = getUnfilledTrips.all(targetDate);

  if (trips.length === 0) {
    console.log(`[email] All trips for ${targetDate} have descriptions. No reminder needed.`);
    return { sent: false, reason: 'all_filled' };
  }

  const tripList = trips.map((t, i) => {
    const from = t.start_address || 'Unknown';
    const to = t.end_address || 'Unknown';
    const dist = t.distance_km ? `${t.distance_km.toFixed(1)} km` : '';
    const time = t.start_time ? new Date(t.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';
    return `  ${i + 1}. ${time} — ${from} → ${to} ${dist}`;
  }).join('\n');

  const subject = `E-Pro: ${trips.length} trip${trips.length > 1 ? 's' : ''} from ${targetDate} need descriptions`;

  const text = `You have ${trips.length} trip${trips.length > 1 ? 's' : ''} from ${targetDate} without descriptions:\n\n${tripList}\n\nOpen Trip Manager to fill them in: http://localhost:${config.port}`;

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject,
    text,
  });

  console.log(`[email] Reminder sent for ${trips.length} unfilled trips on ${targetDate}`);
  return { sent: true, count: trips.length };
}

/**
 * Send weekly report email with per-day breakdown.
 * Covers the previous Monday–Sunday week.
 */
export async function sendWeeklyReport() {
  // Calculate last week's Monday and Sunday
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - dayOfWeek - 6); // previous Monday
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  const fromDate = lastMonday.toISOString().slice(0, 10);
  const toDate = lastSunday.toISOString().slice(0, 10);

  const trips = getTripsForDateRange.all(fromDate, toDate);

  if (trips.length === 0) {
    console.log(`[email] No trips for week ${fromDate} to ${toDate}. Skipping weekly report.`);
    return { sent: false, reason: 'no_trips' };
  }

  // Group trips by date
  const byDate = {};
  for (const trip of trips) {
    if (!byDate[trip.trip_date]) byDate[trip.trip_date] = [];
    byDate[trip.trip_date].push(trip);
  }

  // Weekly totals
  let weekTotalKm = 0;
  let weekTotalTrips = 0;
  let weekBusinessTrips = 0;
  let weekPrivateTrips = 0;

  // Build per-day HTML sections
  const daysSorted = Object.keys(byDate).sort();
  const daySections = daysSorted.map(date => {
    const dayTrips = byDate[date];
    const dayFormatted = new Date(date + 'T00:00:00').toLocaleDateString('en-ZA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const report = getReportForDate.get(date);
    const dayKm = dayTrips.reduce((s, t) => s + (t.distance_km || 0), 0);
    const dayBusiness = dayTrips.filter(t => t.is_business !== 0).length;
    const dayPrivate = dayTrips.length - dayBusiness;

    weekTotalKm += dayKm;
    weekTotalTrips += dayTrips.length;
    weekBusinessTrips += dayBusiness;
    weekPrivateTrips += dayPrivate;

    const tripRows = dayTrips.map(t => {
      const time = t.start_time
        ? new Date(t.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
        : '';
      const endT = t.end_time
        ? new Date(t.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
        : '';
      const from = t.start_address || 'Unknown';
      const to = t.end_address || 'Unknown';
      const dist = t.distance_km ? t.distance_km.toFixed(1) : '0.0';
      const type = t.is_business === 0 ? 'Private' : 'Business';
      const typeColor = t.is_business === 0 ? '#a78bfa' : '#60a5fa';
      const desc = t.user_description || '<em style="color:#8b8fa3;">No description</em>';

      // Get spares for this trip
      const spares = getSparesForTrip.all(t.id);
      const sparesHtml = spares.length > 0
        ? `<div style="margin-top:4px;"><strong>Spares:</strong> ${spares.map(s => `${s.spare_name} x${s.quantity}`).join(', ')}</div>`
        : '';

      return `
        <tr style="border-bottom:1px solid #2a2e3a;">
          <td style="padding:8px;vertical-align:top;white-space:nowrap;">${time} - ${endT}</td>
          <td style="padding:8px;vertical-align:top;">
            <div>${from}</div>
            <div style="color:#8b8fa3;">&#8594; ${to}</div>
          </td>
          <td style="padding:8px;vertical-align:top;text-align:right;">${dist} km</td>
          <td style="padding:8px;vertical-align:top;"><span style="color:${typeColor};font-weight:600;">${type}</span></td>
          <td style="padding:8px;vertical-align:top;">
            <div>${desc}</div>
            ${sparesHtml}
          </td>
        </tr>`;
    }).join('');

    const notesHtml = report && report.notes
      ? `<div style="margin:8px 0;padding:8px 12px;background:#1e293b;border-radius:6px;color:#e4e6eb;font-size:13px;"><strong>Day Notes:</strong> ${escapeHtml(report.notes)}</div>`
      : '';

    return `
      <div style="margin-bottom:24px;">
        <h3 style="color:#e4e6eb;margin:0 0 4px 0;font-size:15px;">${dayFormatted}</h3>
        <div style="display:flex;gap:12px;margin-bottom:8px;font-size:12px;color:#8b8fa3;">
          <span>${dayTrips.length} trips</span>
          <span>${dayKm.toFixed(1)} km</span>
          <span style="color:#60a5fa;">${dayBusiness} business</span>
          <span style="color:#a78bfa;">${dayPrivate} private</span>
        </div>
        ${notesHtml}
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#e4e6eb;">
          <thead>
            <tr style="border-bottom:2px solid #2a2e3a;color:#8b8fa3;text-align:left;">
              <th style="padding:6px 8px;">Time</th>
              <th style="padding:6px 8px;">Route</th>
              <th style="padding:6px 8px;text-align:right;">Dist</th>
              <th style="padding:6px 8px;">Type</th>
              <th style="padding:6px 8px;">Description</th>
            </tr>
          </thead>
          <tbody>${tripRows}</tbody>
        </table>
      </div>`;
  }).join('');

  const subject = `E-Pro Weekly Report: ${fromDate} to ${toDate}`;

  const html = `
    <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e4e6eb;padding:24px;max-width:800px;margin:0 auto;">
      <h1 style="font-size:20px;font-weight:700;margin:0 0 4px 0;color:#e4e6eb;">E-Pro Weekly Trip Report</h1>
      <p style="color:#8b8fa3;margin:0 0 20px 0;font-size:14px;">${fromDate} to ${toDate}</p>

      <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="background:#1a1d27;border:1px solid #2a2e3a;border-radius:8px;padding:12px 20px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#4f8cff;">${weekTotalTrips}</div>
          <div style="font-size:12px;color:#8b8fa3;">Total Trips</div>
        </div>
        <div style="background:#1a1d27;border:1px solid #2a2e3a;border-radius:8px;padding:12px 20px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#34d399;">${weekTotalKm.toFixed(1)}</div>
          <div style="font-size:12px;color:#8b8fa3;">Total KM</div>
        </div>
        <div style="background:#1a1d27;border:1px solid #2a2e3a;border-radius:8px;padding:12px 20px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#60a5fa;">${weekBusinessTrips}</div>
          <div style="font-size:12px;color:#8b8fa3;">Business</div>
        </div>
        <div style="background:#1a1d27;border:1px solid #2a2e3a;border-radius:8px;padding:12px 20px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#a78bfa;">${weekPrivateTrips}</div>
          <div style="font-size:12px;color:#8b8fa3;">Private</div>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid #2a2e3a;margin:0 0 20px 0;" />

      ${daySections}

      <hr style="border:none;border-top:1px solid #2a2e3a;margin:20px 0;" />
      <p style="color:#8b8fa3;font-size:12px;margin:0;">Generated by E-Pro Trip Manager</p>
    </div>`;

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject,
    html,
  });

  console.log(`[email] Weekly report sent for ${fromDate} to ${toDate} (${weekTotalTrips} trips)`);
  return { sent: true, from: fromDate, to: toDate, totalTrips: weekTotalTrips };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
