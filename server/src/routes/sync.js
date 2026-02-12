import { Router } from 'express';
import { syncTrips, yesterday } from '../services/tripSync.js';

const router = Router();

// POST /api/sync  body: { from?, to?, registrations?[] }
router.post('/', async (req, res) => {
  try {
    const from = req.body.from || yesterday();
    const to = req.body.to || from;
    const registrations = req.body.registrations || null;
    const result = await syncTrips(from, to, registrations);
    console.log(`[sync] Synced ${result.synced} trips (${result.vehicles} vehicles) for ${from} to ${to}`);
    res.json(result);
  } catch (err) {
    console.error('[sync] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
