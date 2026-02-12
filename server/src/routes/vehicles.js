import { Router } from 'express';
import { syncVehicles, getVehicles, setVehicleActive } from '../services/vehicleSync.js';

const router = Router();

// GET /api/vehicles — list cached vehicles
router.get('/', (req, res) => {
  try {
    res.json(getVehicles());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vehicles/sync — refresh from Cartrack API
router.post('/sync', async (req, res) => {
  try {
    const result = await syncVehicles();
    console.log(`[vehicles] Synced ${result.synced} vehicles from Cartrack`);
    res.json({ ...result, vehicles: getVehicles() });
  } catch (err) {
    console.error('[vehicles] Sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/vehicles/:registration — toggle is_active
router.patch('/:registration', (req, res) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean' && typeof is_active !== 'number') {
      return res.status(400).json({ error: 'is_active is required (boolean)' });
    }
    const vehicle = setVehicleActive(req.params.registration, is_active);
    res.json(vehicle);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
