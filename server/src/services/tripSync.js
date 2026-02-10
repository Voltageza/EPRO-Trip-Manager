import db from '../db.js';
import { fetchTrips } from './cartrackClient.js';

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

/**
 * Sync trips from Cartrack for a date range.
 * Returns { synced: number } with count of upserted rows.
 */
export async function syncTrips(fromDate, toDate) {
  const trips = await fetchTrips(null, fromDate, toDate);
  const synced = upsertMany(trips);
  return { synced, from: fromDate, to: toDate };
}

/**
 * Helper to get yesterday's date string YYYY-MM-DD.
 */
export function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
