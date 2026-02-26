import db from '../db.js';
import config from '../config.js';
import { fetchTrips } from './cartrackClient.js';
import { getActiveRegistrations } from './vehicleSync.js';

const upsertStmt = db.prepare(`
  INSERT INTO trips (
    registration, trip_date, start_time, end_time,
    start_address, end_address, start_lat, start_lng,
    end_lat, end_lng, distance_km, duration_minutes,
    max_speed, avg_speed, idle_time_minutes, trip_type,
    cartrack_title, cartrack_notes, raw_json, synced_at
  ) VALUES (
    @registration, @trip_date, @start_time, @end_time,
    @start_address, @end_address, @start_lat, @start_lng,
    @end_lat, @end_lng, @distance_km, @duration_minutes,
    @max_speed, @avg_speed, @idle_time_minutes, @trip_type,
    @cartrack_title, @cartrack_notes, @raw_json, @synced_at
  )
  ON CONFLICT(registration, start_time) DO UPDATE SET
    trip_date        = excluded.trip_date,
    end_time         = excluded.end_time,
    start_address    = excluded.start_address,
    end_address      = excluded.end_address,
    start_lat        = excluded.start_lat,
    start_lng        = excluded.start_lng,
    end_lat          = excluded.end_lat,
    end_lng          = excluded.end_lng,
    distance_km      = excluded.distance_km,
    duration_minutes = excluded.duration_minutes,
    max_speed        = excluded.max_speed,
    avg_speed        = excluded.avg_speed,
    idle_time_minutes= excluded.idle_time_minutes,
    trip_type        = excluded.trip_type,
    cartrack_title   = excluded.cartrack_title,
    cartrack_notes   = excluded.cartrack_notes,
    raw_json         = excluded.raw_json,
    synced_at        = excluded.synced_at
  WHERE merge_snapshot IS NULL
`);

const upsertMany = db.transaction((trips) => {
  const now = new Date().toISOString();
  let count = 0;
  for (const trip of trips) {
    upsertStmt.run({ ...trip, synced_at: now });
    count++;
  }
  return count;
});

const autoClaimStmt = db.prepare(`
  UPDATE trips
  SET claimed_by_user_id = ?, claimed_at = ?, updated_at = ?
  WHERE registration = ? AND trip_date BETWEEN ? AND ?
    AND claimed_by_user_id IS NULL AND merged_into IS NULL
`);

/**
 * Sync trips from Cartrack for a date range.
 * If registrations[] is provided, syncs those vehicles.
 * Otherwise falls back to active vehicles from the DB, then .env.
 * If userId is provided, newly synced unclaimed trips are auto-claimed for that user.
 */
export async function syncTrips(fromDate, toDate, registrations, userId) {
  const regs = registrations && registrations.length > 0
    ? registrations
    : getActiveRegistrations();

  let totalSynced = 0;
  const errors = [];

  // Sync each vehicle sequentially to avoid rate limits
  for (const reg of regs) {
    try {
      const trips = await fetchTrips(reg, fromDate, toDate);
      const synced = upsertMany(trips);
      totalSynced += synced;
      // Auto-claim unclaimed trips for the syncing user
      if (userId) {
        const now = new Date().toISOString();
        autoClaimStmt.run(userId, now, now, reg, fromDate, toDate);
      }
    } catch (err) {
      console.error(`[sync] Error syncing ${reg}:`, err.message);
      errors.push({ registration: reg, error: err.message });
    }
  }

  return {
    synced: totalSynced,
    from: fromDate,
    to: toDate,
    vehicles: regs.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Helper to get yesterday's date string YYYY-MM-DD.
 */
export function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
