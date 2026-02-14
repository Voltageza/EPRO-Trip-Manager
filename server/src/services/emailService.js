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

const getBusinessTripsForDateRange = db.prepare(`
  SELECT * FROM trips
  WHERE trip_date >= ? AND trip_date <= ? AND merged_into IS NULL AND is_business = 1
  ORDER BY registration ASC, trip_date ASC, start_time ASC
`);

const getAllTripsForDateRange = db.prepare(`
  SELECT * FROM trips
  WHERE trip_date >= ? AND trip_date <= ? AND merged_into IS NULL
  ORDER BY registration ASC, trip_date ASC, start_time ASC
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
 * Send weekly jobcard report email grouped by driver.
 * Covers the previous Monday–Sunday week (or custom range).
 * Only includes business trips.
 */
export async function sendWeeklyReport(overrideFrom, overrideTo) {
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

  const businessTrips = getBusinessTripsForDateRange.all(fromDate, toDate);
  // Also get all trips (including private) to calculate labour gaps accurately
  const allTrips = getAllTripsForDateRange.all(fromDate, toDate);
  const locations = getAllLocations.all();

  if (businessTrips.length === 0) {
    console.log(`[email] No business trips for ${fromDate} to ${toDate}. Skipping jobcard report.`);
    return { sent: false, reason: 'no_trips' };
  }

  // Group ALL trips by vehicle+date for labour calculation
  const allByVehicleDate = {};
  for (const t of allTrips) {
    const key = `${t.registration}|${t.trip_date}`;
    if (!allByVehicleDate[key]) allByVehicleDate[key] = [];
    allByVehicleDate[key].push(t);
  }

  // Group business trips by vehicle
  const byVehicle = {};
  for (const t of businessTrips) {
    if (!byVehicle[t.registration]) byVehicle[t.registration] = [];
    byVehicle[t.registration].push(t);
  }

  // Build per-driver sections
  const driverSections = Object.entries(byVehicle).map(([reg, trips]) => {
    const vehicle = getVehicle.get(reg);
    const driverName = vehicle ? vehicle.description : reg;

    const jobEntries = trips.map((trip, idx) => {
      // Customer: use custom location name, geofence, or cleaned address
      const locationName = findLocationName(trip.end_lat, trip.end_lng, locations);
      const customer = locationName || cleanAddress(trip.end_address);

      // Traveltime: driving duration
      const traveltime = formatDuration(trip.duration_minutes);

      // Kilometers
      const km = trip.distance_km ? `${trip.distance_km.toFixed(1)} km` : '0 km';

      // Labour: time at customer = gap between this trip's end_time and next trip's start_time
      const dayTrips = allByVehicleDate[`${reg}|${trip.trip_date}`] || [];
      const tripIdx = dayTrips.findIndex(t => t.id === trip.id);
      let labour = '-';
      if (tripIdx >= 0 && tripIdx < dayTrips.length - 1) {
        const nextTrip = dayTrips[tripIdx + 1];
        const endMs = new Date(trip.end_time).getTime();
        const nextStartMs = new Date(nextTrip.start_time).getTime();
        const gapMinutes = (nextStartMs - endMs) / 60000;
        if (gapMinutes > 0 && gapMinutes < 480) { // cap at 8h to avoid overnight gaps
          labour = formatDuration(gapMinutes);
        }
      }

      // Date formatted
      const dateStr = new Date(trip.trip_date + 'T00:00:00').toLocaleDateString('en-ZA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      // Job description
      const desc = trip.user_description
        ? `<span>${escapeHtml(trip.user_description)}</span>`
        : '<span style="color:#999;font-style:italic;">No description</span>';

      // Spares
      const spares = getSparesForTrip.all(trip.id);
      const sparesHtml = spares.length > 0
        ? spares.map(s => `<span>&bull; ${escapeHtml(s.spare_name)} x${s.quantity}</span>`).join('<br/>')
        : '<span style="color:#999;font-style:italic;">None</span>';

      // Separator between entries (not before the first one)
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

  const subject = `E-Pro Weekly Jobcard Report: ${fromDate} to ${toDate}`;

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#ffffff;color:#222;padding:24px;max-width:700px;margin:0 auto;">
      ${driverSections}
      <hr style="border:none;border-top:1px solid #ccc;margin:24px 0 8px 0;" />
      <p style="color:#999;font-size:11px;margin:0;">Generated by E-Pro Trip Manager</p>
    </div>`;

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject,
    html,
  });

  console.log(`[email] Weekly jobcard report sent for ${fromDate} to ${toDate} (${businessTrips.length} business trips)`);
  return { sent: true, from: fromDate, to: toDate, totalTrips: businessTrips.length };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
