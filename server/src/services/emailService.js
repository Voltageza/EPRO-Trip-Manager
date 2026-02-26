import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer';
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

const getClaimedPrivateTrips = db.prepare(`
  SELECT t.*, u.display_name as claimed_by_name
  FROM trips t
  LEFT JOIN users u ON t.claimed_by_user_id = u.id
  WHERE t.trip_date >= ? AND t.trip_date <= ? AND t.merged_into IS NULL
    AND t.is_business = 0 AND t.claimed_by_user_id IS NOT NULL
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

const getLinkedJob = db.prepare(`
  SELECT j.reference_number, j.description AS job_description, j.status,
         c.name AS customer_name
  FROM job_trips jt
  JOIN jobs j ON jt.job_id = j.id
  LEFT JOIN customers c ON j.customer_id = c.id
  WHERE jt.trip_id = ?
  LIMIT 1
`);

const getAbsorbedForEmail = db.prepare(
  'SELECT end_address, end_lat, end_lng, distance_km, duration_minutes FROM trips WHERE id = ?'
);

/**
 * Build intermediate stops array for a merged trip (mirrors withExtras in trips.js).
 */
function buildStops(trip) {
  if (!trip.merge_snapshot) return [];
  try {
    const snapshot = JSON.parse(trip.merge_snapshot);
    const absorbedIds = snapshot.absorbed_ids || [];
    const stops = [];
    if (snapshot.original?.end_address) {
      stops.push({
        address: snapshot.original.end_address,
        lat: snapshot.original.end_lat ?? null,
        lng: snapshot.original.end_lng ?? null,
        distance_km: snapshot.original.distance_km ?? null,
        duration_minutes: snapshot.original.duration_minutes ?? null,
      });
    }
    for (let i = 0; i < absorbedIds.length - 1; i++) {
      const abs = getAbsorbedForEmail.get(absorbedIds[i]);
      if (abs) stops.push({
        address: abs.end_address,
        lat: abs.end_lat ?? null,
        lng: abs.end_lng ?? null,
        distance_km: abs.distance_km ?? null,
        duration_minutes: abs.duration_minutes ?? null,
      });
    }
    return stops;
  } catch { return []; }
}

/**
 * Render an HTML string to a PDF buffer using a headless Chromium instance.
 */
async function generatePdf(html, title = 'E-Pro Report') {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>${html}</body>
</html>`;
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

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
      const linkedJob = getLinkedJob.get(trip.id);
      const locationName = findLocationName(trip.end_lat, trip.end_lng, locations);
      // Customer: linked job customer → trip.customer_name → GPS location name → address
      const customer = linkedJob?.customer_name || trip.customer_name || locationName || cleanAddress(trip.end_address);
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

      // Description: trip note → job description → fallback
      const descText = trip.user_description || linkedJob?.job_description || null;
      const desc = descText
        ? `<span>${escapeHtml(descText)}</span>`
        : '<span style="color:#999;font-style:italic;">No description</span>';

      const spares = getSparesForTrip.all(trip.id);
      const sparesHtml = spares.length > 0
        ? spares.map(s => `<span>&bull; ${escapeHtml(s.spare_name)} x${s.quantity}</span>`).join('<br/>')
        : '<span style="color:#999;font-style:italic;">None</span>';

      // Build route HTML (start → stops → end)
      const stops = buildStops(trip);
      const startLocName = findLocationName(trip.start_lat, trip.start_lng, locations);
      const endLocName = findLocationName(trip.end_lat, trip.end_lng, locations);
      const routeRows = [];
      const dotStyle = 'display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;';
      const lineStyle = 'display:inline-block;width:1px;height:10px;background:#ccc;margin:1px 0 1px 3px;vertical-align:middle;';
      const addrStyle = 'font-size:13px;color:#374151;';
      const stopAddrStyle = 'font-size:13px;color:#6b7280;';
      const tagStyle = 'display:inline-block;font-size:11px;font-weight:600;background:#e5e7eb;color:#374151;border-radius:4px;padding:1px 6px;margin-left:4px;';
      const legStyle = 'font-size:11px;color:#9ca3af;margin-left:6px;';

      // Start
      routeRows.push(
        `<tr><td style="padding:1px 0;${addrStyle}">` +
        `<span style="${dotStyle}background:#3b82f6;"></span>${escapeHtml(cleanAddress(trip.start_address))}` +
        (startLocName ? `<span style="${tagStyle}">${escapeHtml(startLocName)}</span>` : '') +
        `</td></tr>`
      );
      routeRows.push(`<tr><td><span style="${lineStyle}"></span></td></tr>`);

      // Intermediate stops
      stops.forEach((stop, i) => {
        const stopLocName = findLocationName(stop.lat, stop.lng, locations);
        const legStats = [
          stop.distance_km != null ? `${stop.distance_km.toFixed(1)} km` : null,
          stop.duration_minutes != null ? `${Math.round(stop.duration_minutes)} min` : null,
        ].filter(Boolean).join(' · ');
        routeRows.push(
          `<tr><td style="padding:1px 0;${stopAddrStyle}">` +
          `<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;color:#9ca3af;margin-right:4px;">STOP ${i + 1}</span>` +
          escapeHtml(cleanAddress(stop.address)) +
          (stopLocName ? `<span style="${tagStyle}">${escapeHtml(stopLocName)}</span>` : '') +
          (legStats ? `<span style="${legStyle}">${legStats}</span>` : '') +
          `</td></tr>`
        );
        routeRows.push(`<tr><td><span style="${lineStyle}"></span></td></tr>`);
      });

      // End
      routeRows.push(
        `<tr><td style="padding:1px 0;${addrStyle}">` +
        `<span style="${dotStyle}background:#22c55e;"></span>${escapeHtml(cleanAddress(trip.end_address))}` +
        (endLocName ? `<span style="${tagStyle}">${escapeHtml(endLocName)}</span>` : '') +
        `</td></tr>`
      );
      const routeHtml = `<table style="border-collapse:collapse;">${routeRows.join('')}</table>`;

      const separator = idx > 0
        ? '<tr><td colspan="2" style="padding:8px 0;"><hr style="border:none;border-top:1px dashed #ccc;margin:0;"/></td></tr>'
        : '';

      const startTime = trip.start_time
        ? new Date(trip.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
        : '';
      const endTime = trip.end_time
        ? new Date(trip.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
        : '';
      const timeStr = startTime && endTime ? `${startTime} — ${endTime}` : startTime || endTime || '-';

      const jobRefRow = linkedJob?.reference_number
        ? `<tr><td style="padding:4px 0;font-weight:600;width:120px;vertical-align:top;">Job Ref:</td><td style="padding:4px 0;font-family:monospace;font-size:13px;">${escapeHtml(linkedJob.reference_number)}</td></tr>`
        : '';

      return `
        ${separator}
        <tr><td style="padding:4px 0;font-weight:600;width:120px;vertical-align:top;">Date:</td><td style="padding:4px 0;">${dateStr}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Time:</td><td style="padding:4px 0;">${timeStr}</td></tr>
        ${jobRefRow}
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Customer:</td><td style="padding:4px 0;">${escapeHtml(customer)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Route:</td><td style="padding:4px 0;">${routeHtml}</td></tr>
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
 * Generate weekly private trip report HTML grouped by driver.
 * Returns { html, from, to, totalTrips } without sending email.
 */
export function generatePrivateReportHtml(overrideFrom, overrideTo) {
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

  const privateTrips = getClaimedPrivateTrips.all(fromDate, toDate);
  const locations = getAllLocations.all();

  if (privateTrips.length === 0) {
    return { html: null, from: fromDate, to: toDate, totalTrips: 0 };
  }

  // Group by claiming user
  const byUser = {};
  for (const t of privateTrips) {
    const key = t.claimed_by_user_id;
    if (!byUser[key]) byUser[key] = [];
    byUser[key].push(t);
  }

  const driverSections = Object.entries(byUser).map(([userId, trips]) => {
    const driverName = trips[0].claimed_by_name || `User ${userId}`;

    const tripEntries = trips.map((trip, idx) => {
      const km = trip.distance_km ? `${trip.distance_km.toFixed(1)} km` : '0 km';
      const traveltime = formatDuration(trip.duration_minutes);

      const dateStr = new Date(trip.trip_date + 'T00:00:00').toLocaleDateString('en-ZA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      const startTime = trip.start_time
        ? new Date(trip.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
        : '';
      const endTime = trip.end_time
        ? new Date(trip.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
        : '';
      const timeStr = startTime && endTime ? `${startTime} — ${endTime}` : startTime || endTime || '-';

      // Build route HTML
      const stops = buildStops(trip);
      const startLocName = findLocationName(trip.start_lat, trip.start_lng, locations);
      const endLocName = findLocationName(trip.end_lat, trip.end_lng, locations);
      const routeRows = [];
      const dotStyle = 'display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;';
      const lineStyle = 'display:inline-block;width:1px;height:10px;background:#ccc;margin:1px 0 1px 3px;vertical-align:middle;';
      const addrStyle = 'font-size:13px;color:#374151;';
      const stopAddrStyle = 'font-size:13px;color:#6b7280;';
      const tagStyle = 'display:inline-block;font-size:11px;font-weight:600;background:#e5e7eb;color:#374151;border-radius:4px;padding:1px 6px;margin-left:4px;';
      const legStyle = 'font-size:11px;color:#9ca3af;margin-left:6px;';

      routeRows.push(
        `<tr><td style="padding:1px 0;${addrStyle}">` +
        `<span style="${dotStyle}background:#3b82f6;"></span>${escapeHtml(cleanAddress(trip.start_address))}` +
        (startLocName ? `<span style="${tagStyle}">${escapeHtml(startLocName)}</span>` : '') +
        `</td></tr>`
      );
      routeRows.push(`<tr><td><span style="${lineStyle}"></span></td></tr>`);

      stops.forEach((stop, i) => {
        const stopLocName = findLocationName(stop.lat, stop.lng, locations);
        const legStats = [
          stop.distance_km != null ? `${stop.distance_km.toFixed(1)} km` : null,
          stop.duration_minutes != null ? `${Math.round(stop.duration_minutes)} min` : null,
        ].filter(Boolean).join(' · ');
        routeRows.push(
          `<tr><td style="padding:1px 0;${stopAddrStyle}">` +
          `<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;color:#9ca3af;margin-right:4px;">STOP ${i + 1}</span>` +
          escapeHtml(cleanAddress(stop.address)) +
          (stopLocName ? `<span style="${tagStyle}">${escapeHtml(stopLocName)}</span>` : '') +
          (legStats ? `<span style="${legStyle}">${legStats}</span>` : '') +
          `</td></tr>`
        );
        routeRows.push(`<tr><td><span style="${lineStyle}"></span></td></tr>`);
      });

      routeRows.push(
        `<tr><td style="padding:1px 0;${addrStyle}">` +
        `<span style="${dotStyle}background:#22c55e;"></span>${escapeHtml(cleanAddress(trip.end_address))}` +
        (endLocName ? `<span style="${tagStyle}">${escapeHtml(endLocName)}</span>` : '') +
        `</td></tr>`
      );
      const routeHtml = `<table style="border-collapse:collapse;">${routeRows.join('')}</table>`;

      const linkedJobP = getLinkedJob.get(trip.id);
      const notesText = trip.user_description || linkedJobP?.job_description || null;
      const notes = notesText
        ? `<span>${escapeHtml(notesText)}</span>`
        : '<span style="color:#999;font-style:italic;">—</span>';
      const privateJobRefRow = linkedJobP?.reference_number
        ? `<tr><td style="padding:4px 0;font-weight:600;width:120px;vertical-align:top;">Job Ref:</td><td style="padding:4px 0;font-family:monospace;font-size:13px;">${escapeHtml(linkedJobP.reference_number)}</td></tr>`
        : '';

      const separator = idx > 0
        ? '<tr><td colspan="2" style="padding:8px 0;"><hr style="border:none;border-top:1px dashed #ccc;margin:0;"/></td></tr>'
        : '';

      return `
        ${separator}
        <tr><td style="padding:4px 0;font-weight:600;width:120px;vertical-align:top;">Date:</td><td style="padding:4px 0;">${dateStr}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Time:</td><td style="padding:4px 0;">${timeStr}</td></tr>
        ${privateJobRefRow}
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Route:</td><td style="padding:4px 0;">${routeHtml}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Traveltime:</td><td style="padding:4px 0;">${traveltime}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Kilometers:</td><td style="padding:4px 0;">${km}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;vertical-align:top;">Notes:</td><td style="padding:4px 0;">${notes}</td></tr>`;
    }).join('');

    return `
      <div style="margin-bottom:32px;">
        <h2 style="font-size:16px;text-decoration:underline;margin:0 0 4px 0;">Weekly Private Trip Report &ndash; ${fromDate} to ${toDate}</h2>
        <p style="margin:4px 0 12px 0;font-size:14px;">Driver's Name: <strong>${escapeHtml(driverName)}</strong></p>
        <hr style="border:none;border-top:2px solid #333;margin:0 0 16px 0;" />
        <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5;">
          ${tripEntries}
        </table>
      </div>`;
  }).join('<div style="page-break-before:always;margin:24px 0;border-top:3px solid #333;"></div>');

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#ffffff;color:#222;padding:24px;max-width:700px;margin:0 auto;">
      ${driverSections}
      <hr style="border:none;border-top:1px solid #ccc;margin:24px 0 8px 0;" />
      <p style="color:#999;font-size:11px;margin:0;">Generated by E-Pro Trip Manager</p>
    </div>`;

  return { html, from: fromDate, to: toDate, totalTrips: privateTrips.length };
}

/**
 * Send weekly private trip report email as a PDF attachment.
 * If customHtml is provided, that HTML is rendered to PDF instead of regenerating.
 */
export async function sendPrivateReport(overrideFrom, overrideTo, customHtml) {
  const result = generatePrivateReportHtml(overrideFrom, overrideTo);
  const htmlToRender = customHtml || result.html;

  if (!htmlToRender && result.totalTrips === 0) {
    console.log(`[email] No private trips for ${result.from} to ${result.to}. Skipping private report.`);
    return { sent: false, reason: 'no_trips' };
  }

  const subject = `E-Pro Weekly Private Trip Report: ${result.from} to ${result.to}`;
  const filename = `E-Pro-Private-Trips-${result.from}-to-${result.to}.pdf`;

  console.log(`[email] Generating PDF for private trip report ${result.from} to ${result.to}…`);
  const pdfBuffer = await generatePdf(htmlToRender, subject);

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject,
    text: `Please find attached the E-Pro Weekly Private Trip Report for ${result.from} to ${result.to} (${result.totalTrips} trip${result.totalTrips !== 1 ? 's' : ''}).`,
    attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
  });

  console.log(`[email] Weekly private report sent as PDF for ${result.from} to ${result.to} (${result.totalTrips} private trips)`);
  return { sent: true, from: result.from, to: result.to, totalTrips: result.totalTrips };
}

/**
 * Send weekly jobcard report email as a PDF attachment.
 * If customHtml is provided, that HTML is rendered to PDF instead of regenerating.
 */
export async function sendWeeklyReport(overrideFrom, overrideTo, customHtml) {
  const result = generateWeeklyReportHtml(overrideFrom, overrideTo);
  const htmlToRender = customHtml || result.html;

  if (!htmlToRender && result.totalTrips === 0) {
    console.log(`[email] No business trips for ${result.from} to ${result.to}. Skipping jobcard report.`);
    return { sent: false, reason: 'no_trips' };
  }

  const subject = `E-Pro Weekly Jobcard Report: ${result.from} to ${result.to}`;
  const filename = `E-Pro-Jobcard-Report-${result.from}-to-${result.to}.pdf`;

  console.log(`[email] Generating PDF for jobcard report ${result.from} to ${result.to}…`);
  const pdfBuffer = await generatePdf(htmlToRender, subject);

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject,
    text: `Please find attached the E-Pro Weekly Jobcard Report for ${result.from} to ${result.to} (${result.totalTrips} business trip${result.totalTrips !== 1 ? 's' : ''}).`,
    attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
  });

  console.log(`[email] Weekly jobcard report sent as PDF for ${result.from} to ${result.to} (${result.totalTrips} business trips)`);
  return { sent: true, from: result.from, to: result.to, totalTrips: result.totalTrips };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
