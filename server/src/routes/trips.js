import { Router } from 'express';
import db from '../db.js';

const router = Router();

const getMyTrips = db.prepare(`
  SELECT t.*, u.display_name as claimed_by_name
  FROM trips t
  LEFT JOIN users u ON t.claimed_by_user_id = u.id
  WHERE t.trip_date >= ? AND t.trip_date <= ? AND t.merged_into IS NULL
    AND t.claimed_by_user_id = ?
  ORDER BY t.start_time ASC
`);

const getUnclaimedTripsStmt = db.prepare(`
  SELECT * FROM trips
  WHERE trip_date >= ? AND trip_date <= ? AND merged_into IS NULL
    AND claimed_by_user_id IS NULL
  ORDER BY start_time ASC
`);

const getTrip = db.prepare('SELECT * FROM trips WHERE id = ?');

const getSparesByTrip = db.prepare(`
  SELECT * FROM trip_spares WHERE trip_id = ? ORDER BY created_at ASC
`);

const insertSpare = db.prepare(`
  INSERT INTO trip_spares (trip_id, spare_name, quantity, created_at)
  VALUES (?, ?, ?, ?)
`);

const deleteSpare = db.prepare(`
  DELETE FROM trip_spares WHERE id = ? AND trip_id = ?
`);

const getMergedFrom = db.prepare(`
  SELECT id FROM trips WHERE merged_into = ?
`);

const getLinkedJob = db.prepare(`
  SELECT j.id, j.reference_number, j.status, j.description, j.assigned_to,
         c.name as customer_name
  FROM job_trips jt
  JOIN jobs j ON jt.job_id = j.id
  LEFT JOIN customers c ON j.customer_id = c.id
  WHERE jt.trip_id = ?
  LIMIT 1
`);

const getAbsorbedEndpoint = db.prepare(
  'SELECT end_address, end_lat, end_lng, distance_km, duration_minutes, customer_name FROM trips WHERE id = ?'
);

function withExtras(trip) {
  const mergedFromIds = trip.merge_snapshot ? getMergedFrom.all(trip.id).map(r => r.id) : [];

  // Build intermediate stops for merged trips:
  // Route = start → [primary's orig end] → [each absorbed end except last] → end
  let stops = [];
  if (trip.merge_snapshot) {
    try {
      const snapshot = JSON.parse(trip.merge_snapshot);
      const absorbedIds = snapshot.absorbed_ids || [];
      // First stop: primary trip's original end address (before merge overwrote it)
      if (snapshot.original?.end_address) {
        stops.push({
          address: snapshot.original.end_address,
          lat: snapshot.original.end_lat ?? null,
          lng: snapshot.original.end_lng ?? null,
          distance_km: snapshot.original.distance_km ?? null,
          duration_minutes: snapshot.original.duration_minutes ?? null,
          customer_name: snapshot.original.customer_name ?? null,
        });
      }
      // Additional stops: each absorbed trip's end EXCEPT the last
      // (last absorbed trip's end == merged trip's current end_address, already shown)
      for (let i = 0; i < absorbedIds.length - 1; i++) {
        const abs = getAbsorbedEndpoint.get(absorbedIds[i]);
        if (abs) stops.push({
          address: abs.end_address,
          lat: abs.end_lat ?? null,
          lng: abs.end_lng ?? null,
          distance_km: abs.distance_km ?? null,
          customer_name: abs.customer_name ?? null,
          duration_minutes: abs.duration_minutes ?? null,
        });
      }
    } catch { /* ignore */ }
  }

  return {
    ...trip,
    spares: getSparesByTrip.all(trip.id),
    merged_from: mergedFromIds,
    linked_job: getLinkedJob.get(trip.id) || null,
    stops,
  };
}

function defaultDateRange(req) {
  const today = new Date();
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const defaultDate = yesterdayDate.toISOString().slice(0, 10);
  const from = req.query.from || defaultDate;
  const to = req.query.to || from;
  return { from, to };
}

// POST /api/trips — create a manual trip (auto-claimed by current user)
router.post('/', (req, res) => {
  try {
    const {
      registration, trip_date, start_time, end_time,
      start_address, end_address,
      start_lat, start_lng, end_lat, end_lng,
      distance_km, duration_minutes: clientDuration,
      user_description, is_business,
    } = req.body;
    if (!registration || !trip_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'registration, trip_date, start_time, end_time are required' });
    }

    const startIso = `${trip_date}T${start_time}:00`;
    const endIso = `${trip_date}T${end_time}:00`;
    const calculatedDuration = (new Date(endIso) - new Date(startIso)) / 60000;
    const durationMinutes = (clientDuration != null && clientDuration !== '') ? Number(clientDuration) : (calculatedDuration > 0 ? calculatedDuration : null);
    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO trips (
        registration, trip_date, start_time, end_time,
        start_address, end_address,
        start_lat, start_lng, end_lat, end_lng,
        distance_km, duration_minutes,
        user_description, is_business,
        claimed_by_user_id, claimed_at, synced_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      registration,
      trip_date,
      startIso,
      endIso,
      start_address || null,
      end_address || null,
      start_lat != null ? Number(start_lat) : null,
      start_lng != null ? Number(start_lng) : null,
      end_lat != null ? Number(end_lat) : null,
      end_lng != null ? Number(end_lng) : null,
      distance_km != null && distance_km !== '' ? Number(distance_km) : null,
      durationMinutes,
      user_description || null,
      is_business != null ? (is_business ? 1 : 0) : 1,
      req.user.id,
      now,
      now,
      now
    );

    const trip = getTrip.get(result.lastInsertRowid);
    res.status(201).json(withExtras(trip));
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A trip for this vehicle at this start time already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips?from=YYYY-MM-DD&to=YYYY-MM-DD — trips claimed by current user
router.get('/', (req, res) => {
  const { from, to } = defaultDateRange(req);
  const trips = getMyTrips.all(from, to, req.user.id);
  res.json(trips.map(withExtras));
});

// GET /api/trips/unclaimed?from=YYYY-MM-DD&to=YYYY-MM-DD — unclaimed pool
router.get('/unclaimed', (req, res) => {
  const { from, to } = defaultDateRange(req);
  const trips = getUnclaimedTripsStmt.all(from, to);
  res.json(trips.map(withExtras));
});

// POST /api/trips/:id/claim — claim a trip for current user
router.post('/:id/claim', (req, res) => {
  const trip = getTrip.get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.claimed_by_user_id && trip.claimed_by_user_id !== req.user.id) {
    return res.status(409).json({ error: 'Trip already claimed by another user' });
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE trips SET claimed_by_user_id = ?, claimed_at = ?, updated_at = ? WHERE id = ?')
    .run(req.user.id, now, now, trip.id);
  const updated = getTrip.get(trip.id);
  res.json(withExtras(updated));
});

// POST /api/trips/:id/unclaim — release a trip back to the pool
router.post('/:id/unclaim', (req, res) => {
  const trip = getTrip.get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const now = new Date().toISOString();
  db.prepare('UPDATE trips SET claimed_by_user_id = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?')
    .run(now, trip.id);
  const updated = getTrip.get(trip.id);
  res.json(withExtras(updated));
});

// PATCH /api/trips/:id — partial update (user_description, is_business)
router.patch('/:id', (req, res) => {
  const { user_description, is_business, customer_name } = req.body;

  const trip = getTrip.get(req.params.id);
  if (!trip) {
    return res.status(404).json({ error: 'Trip not found' });
  }

  const updates = [];
  const values = [];

  if (typeof user_description === 'string') {
    updates.push('user_description = ?');
    values.push(user_description);
  }

  if (typeof is_business === 'number' || typeof is_business === 'boolean') {
    updates.push('is_business = ?');
    values.push(is_business ? 1 : 0);
  }

  if (typeof customer_name === 'string') {
    updates.push('customer_name = ?');
    values.push(customer_name);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.push('updated_at = ?');
  const now = new Date().toISOString();
  values.push(now, req.params.id);

  db.prepare(`UPDATE trips SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = getTrip.get(req.params.id);
  res.json(withExtras(updated));
});

// POST /api/trips/:id/spares — add a spare
router.post('/:id/spares', (req, res) => {
  const { spare_name, quantity } = req.body;

  if (!spare_name || typeof spare_name !== 'string' || !spare_name.trim()) {
    return res.status(400).json({ error: 'spare_name is required' });
  }

  const trip = getTrip.get(req.params.id);
  if (!trip) {
    return res.status(404).json({ error: 'Trip not found' });
  }

  const qty = parseInt(quantity, 10) || 1;
  const now = new Date().toISOString();
  const result = insertSpare.run(trip.id, spare_name.trim(), qty, now);

  res.status(201).json({
    id: result.lastInsertRowid,
    trip_id: trip.id,
    spare_name: spare_name.trim(),
    quantity: qty,
    created_at: now,
  });
});

// DELETE /api/trips/:id/spares/:spareId — remove a spare
router.delete('/:id/spares/:spareId', (req, res) => {
  const trip = getTrip.get(req.params.id);
  if (!trip) {
    return res.status(404).json({ error: 'Trip not found' });
  }

  const result = deleteSpare.run(req.params.spareId, trip.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Spare not found' });
  }

  res.json({ deleted: true });
});

// POST /api/trips/merge — merge 2+ trips into one
router.post('/merge', (req, res) => {
  const { tripIds } = req.body;

  if (!Array.isArray(tripIds) || tripIds.length < 2) {
    return res.status(400).json({ error: 'At least 2 tripIds are required' });
  }

  try {
    const result = db.transaction(() => {
      // Fetch all trips
      const trips = tripIds.map(id => {
        const t = getTrip.get(id);
        if (!t) throw new Error(`Trip ${id} not found`);
        return t;
      });

      // Validate: same date
      const dates = new Set(trips.map(t => t.trip_date));
      if (dates.size > 1) throw new Error('All trips must be on the same date');

      // Validate: same vehicle
      const vehicles = new Set(trips.map(t => t.registration));
      if (vehicles.size > 1) throw new Error('Cannot merge trips from different vehicles');

      // Validate: none already absorbed or primary
      for (const t of trips) {
        if (t.merged_into) throw new Error(`Trip ${t.id} is already absorbed into another trip`);
        if (t.merge_snapshot) throw new Error(`Trip ${t.id} is already a merged primary trip`);
      }

      // Primary = earliest start_time
      trips.sort((a, b) => a.start_time.localeCompare(b.start_time));
      const primary = trips[0];
      const absorbed = trips.slice(1);

      // Build snapshot for reversibility
      const snapshot = {
        original: {
          distance_km: primary.distance_km,
          duration_minutes: primary.duration_minutes,
          start_time: primary.start_time,
          end_time: primary.end_time,
          start_address: primary.start_address,
          end_address: primary.end_address,
          start_lat: primary.start_lat,
          start_lng: primary.start_lng,
          end_lat: primary.end_lat,
          end_lng: primary.end_lng,
          max_speed: primary.max_speed,
          avg_speed: primary.avg_speed,
          idle_time_minutes: primary.idle_time_minutes,
          user_description: primary.user_description,
          is_business: primary.is_business,
          customer_name: primary.customer_name ?? null,
        },
        absorbed_ids: absorbed.map(t => t.id),
        spare_source_map: {},
      };

      // Record spare ownership before moving
      for (const t of absorbed) {
        const spares = getSparesByTrip.all(t.id);
        if (spares.length > 0) {
          snapshot.spare_source_map[t.id] = spares.map(s => s.id);
        }
      }

      // Compute merged values
      const allTrips = [primary, ...absorbed];
      const totalDistance = allTrips.reduce((s, t) => s + (t.distance_km || 0), 0);
      const totalDuration = allTrips.reduce((s, t) => s + (t.duration_minutes || 0), 0);
      const totalIdle = allTrips.reduce((s, t) => s + (t.idle_time_minutes || 0), 0);
      const maxSpeed = Math.max(...allTrips.map(t => t.max_speed || 0));
      const last = allTrips[allTrips.length - 1];
      const isBusiness = allTrips.some(t => t.is_business !== 0) ? 1 : 0;
      const descriptions = allTrips
        .map(t => t.user_description || '')
        .filter(Boolean);
      const mergedDesc = descriptions.join(' | ');

      // Update primary with merged values
      // Also patch raw_json.end_geofence_name to reflect the new endpoint
      let updatedRawJson = null;
      if (primary.raw_json) {
        try {
          const raw = JSON.parse(primary.raw_json);
          const lastRaw = last.raw_json ? JSON.parse(last.raw_json) : {};
          raw.end_geofence_name = lastRaw.end_geofence_name || '';
          updatedRawJson = JSON.stringify(raw);
        } catch { /* leave raw_json unchanged */ }
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE trips SET
          distance_km = ?, duration_minutes = ?, end_time = ?,
          end_address = ?, end_lat = ?, end_lng = ?,
          max_speed = ?, idle_time_minutes = ?,
          is_business = ?, user_description = ?,
          merge_snapshot = ?,
          raw_json = COALESCE(?, raw_json),
          updated_at = ?
        WHERE id = ?
      `).run(
        totalDistance, totalDuration, last.end_time,
        last.end_address, last.end_lat, last.end_lng,
        maxSpeed, totalIdle,
        isBusiness, mergedDesc,
        JSON.stringify(snapshot),
        updatedRawJson,
        now,
        primary.id
      );

      // Move spares from absorbed trips to primary
      for (const t of absorbed) {
        db.prepare('UPDATE trip_spares SET trip_id = ? WHERE trip_id = ?').run(primary.id, t.id);
      }

      // Mark absorbed trips
      for (const t of absorbed) {
        db.prepare('UPDATE trips SET merged_into = ?, updated_at = ? WHERE id = ?').run(primary.id, now, t.id);
      }

      // Return updated primary
      return withExtras(getTrip.get(primary.id));
    })();

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/trips/:id/unmerge — reverse a merge
router.post('/:id/unmerge', (req, res) => {
  try {
    const result = db.transaction(() => {
      const trip = getTrip.get(req.params.id);
      if (!trip) throw new Error('Trip not found');
      if (!trip.merge_snapshot) throw new Error('This trip is not a merged primary');

      const snapshot = JSON.parse(trip.merge_snapshot);
      const now = new Date().toISOString();

      // Restore primary's original fields
      const orig = snapshot.original;
      db.prepare(`
        UPDATE trips SET
          distance_km = ?, duration_minutes = ?,
          start_time = ?, end_time = ?,
          start_address = ?, end_address = ?,
          start_lat = ?, start_lng = ?,
          end_lat = ?, end_lng = ?,
          max_speed = ?, avg_speed = ?,
          idle_time_minutes = ?,
          user_description = ?, is_business = ?,
          merge_snapshot = NULL, updated_at = ?
        WHERE id = ?
      `).run(
        orig.distance_km, orig.duration_minutes,
        orig.start_time, orig.end_time,
        orig.start_address, orig.end_address,
        orig.start_lat, orig.start_lng,
        orig.end_lat, orig.end_lng,
        orig.max_speed, orig.avg_speed,
        orig.idle_time_minutes,
        orig.user_description, orig.is_business,
        now, trip.id
      );

      // Move spares back to original trips
      for (const [origTripId, spareIds] of Object.entries(snapshot.spare_source_map)) {
        for (const spareId of spareIds) {
          db.prepare('UPDATE trip_spares SET trip_id = ? WHERE id = ?').run(Number(origTripId), spareId);
        }
      }

      // Clear merged_into on absorbed trips
      for (const absorbedId of snapshot.absorbed_ids) {
        db.prepare('UPDATE trips SET merged_into = NULL, updated_at = ? WHERE id = ?').run(now, absorbedId);
      }

      // Return all separated trips
      const allIds = [trip.id, ...snapshot.absorbed_ids];
      return allIds.map(id => withExtras(getTrip.get(id)));
    })();

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
