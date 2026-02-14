import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/microsoft/electricians — list active electricians
router.get('/electricians', requireAuth, (req, res) => {
  try {
    const electricians = db.prepare(
      'SELECT * FROM electricians WHERE is_active = 1 ORDER BY name'
    ).all();
    res.json(electricians);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/microsoft/electricians — add a new electrician
router.post('/electricians', requireAuth, (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const now = new Date().toISOString();
    const result = db.prepare(
      'INSERT INTO electricians (name, phone, is_active, created_at) VALUES (?, ?, 1, ?)'
    ).run(name.trim(), phone || null, now);
    const electrician = db.prepare('SELECT * FROM electricians WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(electrician);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'An electrician with that name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/microsoft/electricians/:id — update electrician
router.patch('/electricians/:id', requireAuth, (req, res) => {
  try {
    const elec = db.prepare('SELECT * FROM electricians WHERE id = ?').get(req.params.id);
    if (!elec) return res.status(404).json({ error: 'Electrician not found' });

    const fields = ['name', 'phone', 'is_active'];
    const updates = [];
    const values = [];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (updates.length === 0) return res.json(elec);
    values.push(req.params.id);

    db.prepare(`UPDATE electricians SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM electricians WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'An electrician with that name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/microsoft/electricians/:id — remove electrician
router.delete('/electricians/:id', requireAuth, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM electricians WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Electrician not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
