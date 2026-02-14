import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/customers?search= — list/search customers
router.get('/', (req, res) => {
  try {
    const { search } = req.query;
    let customers;
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      customers = db.prepare(
        `SELECT * FROM customers
         WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? OR address LIKE ?
         ORDER BY name`
      ).all(term, term, term, term);
    } else {
      customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
    }
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id — single customer
router.get('/:id', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers — create customer
router.post('/', (req, res) => {
  try {
    const { name, phone, email, address, location_id, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO customers (name, phone, email, address, location_id, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(name.trim(), phone || null, email || null, address || null, location_id || null, notes || null, now, now);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/customers/:id — update customer
router.patch('/:id', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const fields = ['name', 'phone', 'email', 'address', 'location_id', 'notes'];
    const updates = [];
    const values = [];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (updates.length === 0) return res.json(customer);

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.params.id);

    db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id — delete (if no jobs linked)
router.delete('/:id', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const jobCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE customer_id = ?').get(req.params.id);
    if (jobCount.count > 0) {
      return res.status(400).json({ error: `Cannot delete customer with ${jobCount.count} linked job(s)` });
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
