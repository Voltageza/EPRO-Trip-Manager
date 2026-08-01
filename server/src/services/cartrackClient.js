import config from '../config.js';

const { baseUrl, username, password } = config.cartrack;
const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

/**
 * Fetch all vehicles from the Cartrack Fleet API.
 */
export async function fetchVehicles() {
  const url = `${baseUrl}/vehicles`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
    redirect: 'follow',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cartrack vehicles API error ${res.status}: ${body}`);
  }
  const json = await res.json();
  return json.data || json || [];
}

/**
 * Fetch trips from Cartrack Fleet API for a specific vehicle and date range.
 * Endpoint: GET /trips/{registration}?start_timestamp=Y-m-d H:i:s&end_timestamp=Y-m-d H:i:s
 */
export async function fetchTrips(registration, fromDate, toDate) {
  const reg = registration || config.cartrack.registration;
  if (!reg) throw new Error('No vehicle registration configured');

  const allTrips = [];
  let page = 1;

  while (true) {
    const url = new URL(`${baseUrl}/trips/${encodeURIComponent(reg)}`);
    url.searchParams.set('start_timestamp', `${fromDate} 00:00:00`);
    url.searchParams.set('end_timestamp', `${toDate} 23:59:59`);
    url.searchParams.set('page', page);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Cartrack API error ${res.status}: ${body}`);
    }

    const json = await res.json();
    const trips = json.data || [];
    allTrips.push(...trips);

    // Stop when we've reached the last page
    const meta = json.meta || {};
    const lastPage = meta.last_page ?? 1;
    if (page >= lastPage || trips.length === 0) break;
    page++;
  }

  return allTrips.map(raw => mapTrip(raw, reg));
}

/**
 * Map a raw Cartrack trip object to our DB schema.
 * Actual field names from the Cartrack Fleet API (ZA region).
 */
function mapTrip(raw, registration) {
  const startTime = raw.start_timestamp || '';
  const endTime = raw.end_timestamp || '';

  // Extract date from start_timestamp (format: "2025-02-09 12:07:03+02")
  const tripDate = startTime.slice(0, 10);

  const startCoords = raw.start_coordinates || {};
  const endCoords = raw.end_coordinates || {};

  // trip_distance is in meters, convert to km
  const distanceKm = raw.trip_distance != null ? raw.trip_distance / 1000 : null;

  // trip_duration_seconds to minutes
  const durationMinutes = raw.trip_duration_seconds != null ? raw.trip_duration_seconds / 60 : null;

  // idle_time_seconds to minutes
  const idleMinutes = raw.idle_time_seconds != null ? raw.idle_time_seconds / 60 : null;

  return {
    registration: raw.registration || registration,
    trip_date: tripDate,
    start_time: startTime,
    end_time: endTime,
    start_address: raw.start_location || null,
    end_address: raw.end_location || null,
    start_lat: startCoords.latitude || null,
    start_lng: startCoords.longitude || null,
    end_lat: endCoords.latitude || null,
    end_lng: endCoords.longitude || null,
    distance_km: distanceKm,
    duration_minutes: durationMinutes,
    max_speed: raw.max_speed ?? null,
    avg_speed: null, // not provided by API
    idle_time_minutes: idleMinutes,
    trip_type: raw.trip_type || null,
    cartrack_title: raw.trip_title || null,
    cartrack_notes: raw.trip_extra_notes || null,
    raw_json: JSON.stringify(raw),
  };
}
