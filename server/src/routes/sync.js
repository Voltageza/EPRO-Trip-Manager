import { Router } from 'express';
import { syncTrips, yesterday } from '../services/tripSync.js';

const router = Router();

// POST /api/sync  body: { from?, to? }
router.post('/', async (req, res) => {
  try {
    const from = req.body.from || yesterday();
    const to = req.body.to || from;
    const result = await syncTrips(from, to);
    console.log(`[sync] Synced ${result.synced} trips for ${from} to ${to}`);
    res.json(result);
  } catch (err) {
    console.error('[sync] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
