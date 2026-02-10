import { Router } from 'express';
import db from '../db.js';

const router = Router();

const getTrips = db.prepare(`
  SELECT * FROM trips
  WHERE trip_date >= ? AND trip_date <= ?
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

// GET /api/trips?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', (req, res) => {
  const today = new Date();
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const defaultDate = yesterdayDate.toISOString().slice(0, 10);

  const from = req.query.from || defaultDate;
  const to = req.query.to || from;

  const trips = getTrips.all(from, to);

  // Embed spares into each trip
  const tripsWithSpares = trips.map(trip => ({
    ...trip,
    spares: getSparesByTrip.all(trip.id),
  }));

  res.json(tripsWithSpares);
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

export default router;
