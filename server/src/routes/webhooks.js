import { Router } from 'express';
import config from '../config.js';
import db from '../db.js';

const router = Router();

/**
 * POST /api/webhooks/makecom
 *
 * Incoming webhook from Make.com — receives To-Do status updates.
 * When a To-Do task is checked off in Microsoft To-Do, Make.com fires
 * this webhook to update the job status in our DB.
 *
 * Expected payload:
 * {
 *   reference_number: "EP-2026-0001",
 *   action: "complete" | "reopen",
 *   todo_id: "optional-to-do-task-id"
 * }
 */
router.post('/makecom', (req, res) => {
  // Verify webhook secret if configured
  if (config.makecomWebhookSecret) {
    const secret = req.headers['x-webhook-secret'];
    if (secret !== config.makecomWebhookSecret) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
  }

  try {
    const { reference_number, action, todo_id } = req.body;

    if (!reference_number) {
      return res.status(400).json({ error: 'reference_number is required' });
    }

    const job = db.prepare('SELECT * FROM jobs WHERE reference_number = ?').get(reference_number);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const now = new Date().toISOString();

    if (action === 'complete') {
      db.prepare(
        'UPDATE jobs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?'
      ).run('complete', now, now, job.id);
      console.log(`[webhook-in] Marked ${reference_number} as complete (from To-Do)`);
    } else if (action === 'reopen') {
      db.prepare(
        'UPDATE jobs SET status = ?, completed_at = NULL, updated_at = ? WHERE id = ?'
      ).run(job.assigned_to ? 'assigned' : 'unassigned', now, job.id);
      console.log(`[webhook-in] Reopened ${reference_number} (from To-Do)`);
    } else {
      return res.status(400).json({ error: 'action must be "complete" or "reopen"' });
    }

    res.json({ ok: true, reference_number, action });
  } catch (err) {
    console.error('[webhook-in] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
