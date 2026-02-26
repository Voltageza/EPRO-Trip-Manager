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
      tls: {
        rejectUnauthorized: false,
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

const getClaimedBusinessTrips = db.prepare(`
  SELECT t.*, u.display_name as claimed_by_name
  FROM trips t
  LEFT JOIN users u ON t.claimed_by_user_id = u.id
  WHERE t.trip_date >= ? AND t.trip_date <= ? AND t.merged_into IS NULL
    AND t.is_business = 1 AND t.claimed_by_user_id IS NOT NULL
  ORDER BY t.claimed_by_user_id ASC, t.trip_date ASC, t.start_time ASC
`);


const getSparesForTrip = db.prepare(`
  SELECT * FROM trip_spares WHERE trip_id = ? ORDER BY created_at ASC
`);

const getVehicle = db.prepare(`
  SELECT description FROM vehicles WHERE registration = ?
`);

const getAllLocations = db.prepare(`
  SELECT * FROM locations
`);

const getLinkedCustomerName = db.prepare(`
  SELECT c.name
  FROM job_trips jt
  JOIN jobs j ON jt.job_id = j.id
  LEFT JOIN customers c ON j.customer_id = c.id
  WHERE jt.trip_id = ?
  LIMIT 1
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
 * Haversine distance in meters between two GPS points.
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find a custom location name for given coordinates (within 100m).
 */
function findLocationName(lat, lng, locations) {
  if (!lat || !lng) return null;
  for (const loc of locations) {
    if (haversineMeters(lat, lng, loc.lat, loc.lng) <= 100) return loc.name;
  }
  return null;
}

/**
 * Format minutes as "Xh Ym" or "Ym".
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Clean address: strip ", Western Cape, South Africa" suffix.
 */
function cleanAddress(addr) {
  if (!addr) return 'Unknown';
  return addr.replace(/,?\s*Western Cape,?\s*South Africa\s*$/i, '').trim() || addr;
}

/**
 * Generate weekly jobcard report HTML grouped by driver.
 * Returns { html, from, to, totalTrips } without sending email.
 */
export function generateWeeklyReportHtml(overrideFrom, overrideTo) {
  let fromDate, toDate;

  if (overrideFrom && overrideTo) {
    fromDate = overrideFrom;
    toDate = overrideTo;
  } else {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - dayOfWeek - 6);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    fromDate = lastMonday.toISOString().slice(0, 10);
    toDate = lastSunday.toISOString().slice(0, 10);
  }

  const businessTrips = getClaimedBusinessTrips.all(fromDate, toDate);
  const locations = getAllLocations.all();

  if (businessTrips.length === 0) {
    return { html: null, from: fromDate, to: toDate, totalTrips: 0 };
  }

  // Group claimed business trips by claiming user
  // (already sorted by claimed_by_user_id, trip_date, start_time from the query)
  const byUser = {};
  for (const t of businessTrips) {
    const key = t.claimed_by_user_id;
    if (!byUser[key]) byUser[key] = [];
    byUser[key].push(t);
  }

  // Build per-driver sections
  const driverSections = Object.entries(byUser).map(([userId, trips]) => {
    const driverName = trips[0].claimed_by_name || `User ${userId}`;

    const jobEntries = trips.map((trip, idx) => {
      const linkedCustomer = getLinkedCustomerName.get(trip.id);
      const locationName = findLocationName(trip.end_lat, trip.end_lng, locations);
      const customer = trip.customer_name || linkedCustomer?.name || locationName || cleanAddress(trip.end_address);
      const traveltime = formatDuration(trip.duration_minutes);
      const km = trip.distance_km ? `${trip.distance_km.toFixed(1)} km` : '0 km';

      // Labour calculation:
      //  - Merged trip (there-and-back): driver was on-site during the gaps between
      //    sub-trips. Labour = wall-clock span − total driving time.
      //  - Single/one-way trip: driver is still at the site after the trip ends.
      //    Labour = gap to the next business trip for the same user on the same day
      //    (the next trip starts when they leave the site for the next customer).
      let labour = '-';
      if (trip.merge_snapshot) {
        const wallClock = (new Date(trip.end_time) - new Date(trip.start_time)) / 60000;
        const onSite = Math.round(wallClock - (trip.duration_minutes || 0));
        if (onSite > 0) labour = formatDuration(onSite);
      } else {
        const nextTrip = trips[idx + 1];
        if (nextTrip && nextTrip.trip_date === trip.trip_date) {
          const gapMinutes = (new Date(nextTrip.start_time) - new Date(trip.end_time)) / 60000;
          if (gapMinutes > 0 && gapMinutes < 480) labour = formatDuration(gapMinutes);
        }
      }

      const dateStr = new Date(trip.trip_date + 'T00:00:00').toLocaleDateString('en-ZA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      const desc = trip.user_description
        ? `<span>${escapeHtml(trip.user_description)}</span>`
        : '<span style="color:#999;font-style:italic;">No description</span>';

      const spares = getSparesForTrip.all(trip.id);
      const sparesHtml = spares.length > 0
        ? spares.map(s => `<span>&bull; ${escapeHtml(s.spare_name)} x${s.quantity}</span>`).join('<br/>')
        : '<span style="color:#999;font-style:italic;">None</span>';

      const separator = idx > 0
        ? '<tr><td colspan="2" style="padding:8px 0;"><hr style="border:none;border-top:1px dashed #ccc;margin:0;"/></td></tr>'
        : '';

      return `
        ${separator}
        <tr><td style="padding:4px 0;font-weight:600;width:120px;vertical-align:top;">Date:</td><td style="padding:4px 0;">${dateStr}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Customer:</td><td style="padding:4px 0;">${escapeHtml(customer)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Traveltime:</td><td style="padding:4px 0;">${traveltime}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Kilometers:</td><td style="padding:4px 0;">${km}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Labour:</td><td style="padding:4px 0;">${labour}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Job Description:</td><td style="padding:4px 0;">${desc}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Spares:</td><td style="padding:4px 0;">${sparesHtml}</td></tr>`;
    }).join('');

    return `
      <div style="margin-bottom:32px;">
        <h2 style="font-size:16px;text-decoration:underline;margin:0 0 4px 0;">Weekly Jobcard Report &ndash; ${fromDate} to ${toDate}</h2>
        <p style="margin:4px 0 12px 0;font-size:14px;">Driver's Name: <strong>${escapeHtml(driverName)}</strong></p>
        <hr style="border:none;border-top:2px solid #333;margin:0 0 16px 0;" />
        <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5;">
          ${jobEntries}
        </table>
      </div>`;
  }).join('<div style="page-break-before:always;margin:24px 0;border-top:3px solid #333;"></div>');

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#ffffff;color:#222;padding:24px;max-width:700px;margin:0 auto;">
      ${driverSections}
      <hr style="border:none;border-top:1px solid #ccc;margin:24px 0 8px 0;" />
      <p style="color:#999;font-size:11px;margin:0;">Generated by E-Pro Trip Manager</p>
    </div>`;

  return { html, from: fromDate, to: toDate, totalTrips: businessTrips.length };
}

/**
 * Send weekly jobcard report email grouped by driver.
 * If customHtml is provided, sends that instead of regenerating.
 */
export async function sendWeeklyReport(overrideFrom, overrideTo, customHtml) {
  const result = generateWeeklyReportHtml(overrideFrom, overrideTo);

  if (!customHtml && result.totalTrips === 0) {
    console.log(`[email] No business trips for ${result.from} to ${result.to}. Skipping jobcard report.`);
    return { sent: false, reason: 'no_trips' };
  }

  const subject = `E-Pro Weekly Jobcard Report: ${result.from} to ${result.to}`;

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject,
    html: customHtml || result.html,
  });

  console.log(`[email] Weekly jobcard report sent for ${result.from} to ${result.to} (${result.totalTrips} business trips)`);
  return { sent: true, from: result.from, to: result.to, totalTrips: result.totalTrips };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
