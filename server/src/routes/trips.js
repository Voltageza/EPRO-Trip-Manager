import { Router } from 'express';
import db from '../db.js';

const router = Router();

const getTrips = db.prepare(`
  SELECT * FROM trips
  WHERE trip_date >= ? AND trip_date <= ? AND merged_into IS NULL
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

// GET /api/trips?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', (req, res) => {
  const today = new Date();
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const defaultDate = yesterdayDate.toISOString().slice(0, 10);

  const from = req.query.from || defaultDate;
  const to = req.query.to || from;

  const trips = getTrips.all(from, to);

  // Embed spares and merged_from into each trip
  const tripsWithExtras = trips.map(trip => ({
    ...trip,
    spares: getSparesByTrip.all(trip.id),
    merged_from: trip.merge_snapshot
      ? getMergedFrom.all(trip.id).map(r => r.id)
      : [],
  }));

  res.json(tripsWithExtras);
});

// PATCH /api/trips/:id — partial update (user_description, is_business)
router.patch('/:id', (req, res) => {
  const { user_description, is_business } = req.body;

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

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.push('updated_at = ?');
  const now = new Date().toISOString();
  values.push(now, req.params.id);

  db.prepare(`UPDATE trips SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = getTrip.get(req.params.id);
  updated.spares = getSparesByTrip.all(updated.id);
  res.json(updated);
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
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE trips SET
          distance_km = ?, duration_minutes = ?, end_time = ?,
          end_address = ?, end_lat = ?, end_lng = ?,
          max_speed = ?, idle_time_minutes = ?,
          is_business = ?, user_description = ?,
          merge_snapshot = ?, updated_at = ?
        WHERE id = ?
      `).run(
        totalDistance, totalDuration, last.end_time,
        last.end_address, last.end_lat, last.end_lng,
        maxSpeed, totalIdle,
        isBusiness, mergedDesc,
        JSON.stringify(snapshot), now,
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
      const updated = getTrip.get(primary.id);
      updated.spares = getSparesByTrip.all(updated.id);
      updated.merged_from = absorbed.map(t => t.id);
      return updated;
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
      return allIds.map(id => {
        const t = getTrip.get(id);
        t.spares = getSparesByTrip.all(t.id);
        t.merged_from = [];
        return t;
      });
    })();

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
