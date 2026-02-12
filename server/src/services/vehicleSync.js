import db from '../db.js';
import config from '../config.js';
import { fetchVehicles } from './cartrackClient.js';

const upsertVehicle = db.prepare(`
  INSERT INTO vehicles (registration, description, make, model, year, raw_json, last_synced)
  VALUES (@registration, @description, @make, @model, @year, @raw_json, @last_synced)
  ON CONFLICT(registration) DO UPDATE SET
    description = excluded.description,
    make        = excluded.make,
    model       = excluded.model,
    year        = excluded.year,
    raw_json    = excluded.raw_json,
    last_synced = excluded.last_synced
`);

const upsertMany = db.transaction((vehicles) => {
  const now = new Date().toISOString();
  let count = 0;
  for (const v of vehicles) {
    upsertVehicle.run({
      registration: v.registration,
      description: v.description || v.unit_description || '',
      make: v.make || '',
      model: v.model || '',
      year: v.year || '',
      raw_json: JSON.stringify(v),
      last_synced: now,
    });
    count++;
  }
  return count;
});

export async function syncVehicles() {
  const raw = await fetchVehicles();
  const vehicles = Array.isArray(raw) ? raw : [];
  const count = upsertMany(vehicles);

  // If the .env vehicle exists but wasn't in the API response, ensure it's in the table
  const envReg = config.cartrack.registration;
  if (envReg) {
    const exists = db.prepare('SELECT 1 FROM vehicles WHERE registration = ?').get(envReg);
    if (!exists) {
      upsertVehicle.run({
        registration: envReg,
        description: 'Default vehicle (from .env)',
        make: '', model: '', year: '',
        raw_json: '{}',
        last_synced: new Date().toISOString(),
      });
    }
  }

  return { synced: count };
}

export function getVehicles() {
  return db.prepare('SELECT * FROM vehicles ORDER BY is_active DESC, registration ASC').all();
}

export function getActiveRegistrations() {
  const rows = db.prepare('SELECT registration FROM vehicles WHERE is_active = 1').all();
  if (rows.length > 0) return rows.map(r => r.registration);
  // Fallback to .env vehicle
  const envReg = config.cartrack.registration;
  return envReg ? [envReg] : [];
}

export function setVehicleActive(registration, isActive) {
  const result = db.prepare('UPDATE vehicles SET is_active = ? WHERE registration = ?')
    .run(isActive ? 1 : 0, registration);
  if (result.changes === 0) throw new Error(`Vehicle ${registration} not found`);
  return db.prepare('SELECT * FROM vehicles WHERE registration = ?').get(registration);
}
