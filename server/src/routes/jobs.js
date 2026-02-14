import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import db from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(__dirname, '../../uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const router = Router();

// Helper: generate next reference number EP-YYYY-NNNN
function generateRefNumber() {
  const year = new Date().getFullYear();
  const prefix = `EP-${year}-`;
  const last = db.prepare(
    `SELECT reference_number FROM jobs
     WHERE reference_number LIKE ?
     ORDER BY reference_number DESC LIMIT 1`
  ).get(`${prefix}%`);

  let seq = 1;
  if (last) {
    const num = parseInt(last.reference_number.split('-')[2], 10);
    if (!isNaN(num)) seq = num + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// GET /api/jobs?status=&assigned_to=&from=&to=&search= — list with filters
router.get('/', (req, res) => {
  try {
    const { status, assigned_to, from, to, search } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('j.status = ?');
      params.push(status);
    }
    if (assigned_to) {
      conditions.push('j.assigned_to = ?');
      params.push(assigned_to);
    }
    if (from) {
      conditions.push('j.created_at >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('j.created_at <= ?');
      params.push(to + 'T23:59:59');
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(j.reference_number LIKE ? OR j.description LIKE ? OR c.name LIKE ?)');
      params.push(term, term, term);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const jobs = db.prepare(`
      SELECT j.*,
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             v.description as vehicle_name,
             u.display_name as created_by_name
      FROM jobs j
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN vehicles v ON j.assigned_to = v.registration
      LEFT JOIN users u ON j.created_by = u.id
      ${where}
      ORDER BY j.created_at DESC
    `).all(...params);

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id — single job with photos
router.get('/:id', (req, res) => {
  try {
    const job = db.prepare(`
      SELECT j.*,
             c.name as customer_name, c.phone as customer_phone,
             c.email as customer_email, c.address as customer_address,
             v.description as vehicle_name,
             u.display_name as created_by_name
      FROM jobs j
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN vehicles v ON j.assigned_to = v.registration
      LEFT JOIN users u ON j.created_by = u.id
      WHERE j.id = ?
    `).get(req.params.id);

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const photos = db.prepare(
      'SELECT * FROM job_photos WHERE job_id = ? ORDER BY created_at'
    ).all(req.params.id);

    res.json({ ...job, photos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs — create job
router.post('/', (req, res) => {
  try {
    const { customer_id, assigned_to, description, special_instructions, priority } = req.body;
    const now = new Date().toISOString();
    const reference_number = generateRefNumber();
    const status = assigned_to ? 'assigned' : 'unassigned';

    const result = db.prepare(`
      INSERT INTO jobs (reference_number, customer_id, assigned_to, description,
                        special_instructions, status, priority, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reference_number,
      customer_id || null,
      assigned_to || null,
      description || null,
      special_instructions || null,
      status,
      priority || 'normal',
      req.user.id,
      now,
      now
    );

    const job = db.prepare(`
      SELECT j.*,
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             v.description as vehicle_name,
             u.display_name as created_by_name
      FROM jobs j
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN vehicles v ON j.assigned_to = v.registration
      LEFT JOIN users u ON j.created_by = u.id
      WHERE j.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/jobs/:id — update job
router.patch('/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const fields = ['customer_id', 'assigned_to', 'description', 'special_instructions', 'status', 'priority'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    // Auto-set status when assigning
    if (req.body.assigned_to && !req.body.status && job.status === 'unassigned') {
      updates.push('status = ?');
      values.push('assigned');
    }

    // Set completed_at when marking complete/incomplete
    if (req.body.status === 'complete' || req.body.status === 'incomplete') {
      updates.push('completed_at = ?');
      values.push(new Date().toISOString());
    }

    if (updates.length === 0) return res.json(job);

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.params.id);

    db.prepare(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare(`
      SELECT j.*,
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             v.description as vehicle_name,
             u.display_name as created_by_name
      FROM jobs j
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN vehicles v ON j.assigned_to = v.registration
      LEFT JOIN users u ON j.created_by = u.id
      WHERE j.id = ?
    `).get(req.params.id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id — delete job + cascade photos from disk
router.delete('/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Delete photo files from disk
    const photos = db.prepare('SELECT filename FROM job_photos WHERE job_id = ?').all(req.params.id);
    for (const photo of photos) {
      const filePath = resolve(uploadsDir, photo.filename);
      try { unlinkSync(filePath); } catch {}
    }

    db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/photos — upload photos
router.post('/:id/photos', upload.array('photos', 5), (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const now = new Date().toISOString();
    const insertStmt = db.prepare(
      `INSERT INTO job_photos (job_id, filename, original_name, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const photos = [];
    for (const file of req.files) {
      const result = insertStmt.run(
        req.params.id, file.filename, file.originalname, file.mimetype, file.size, now
      );
      photos.push(db.prepare('SELECT * FROM job_photos WHERE id = ?').get(result.lastInsertRowid));
    }

    res.status(201).json(photos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id/photos/:photoId — delete single photo
router.delete('/:id/photos/:photoId', (req, res) => {
  try {
    const photo = db.prepare(
      'SELECT * FROM job_photos WHERE id = ? AND job_id = ?'
    ).get(req.params.photoId, req.params.id);

    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const filePath = resolve(uploadsDir, photo.filename);
    try { unlinkSync(filePath); } catch {}

    db.prepare('DELETE FROM job_photos WHERE id = ?').run(req.params.photoId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 10MB)' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files (max 5)' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
