import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { sendWeeklyReport, generateWeeklyReportHtml } from '../services/emailService.js';

const router = Router();

const getReport = db.prepare(`
  SELECT * FROM daily_reports WHERE report_date = ?
`);

const getTripsForDate = db.prepare(`
  SELECT * FROM trips WHERE trip_date = ? AND merged_into IS NULL ORDER BY start_time ASC
`);

const upsertReport = db.prepare(`
  INSERT INTO daily_reports (report_date, total_trips, business_trips, private_trips, total_km, notes, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(report_date) DO UPDATE SET
    total_trips = excluded.total_trips,
    business_trips = excluded.business_trips,
    private_trips = excluded.private_trips,
    total_km = excluded.total_km,
    notes = excluded.notes
`);

// POST /api/reports — submit/update daily report (auto-calculates stats)
router.post('/', (req, res) => {
  const { date, notes } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  }

  const trips = getTripsForDate.all(date);
  const totalTrips = trips.length;
  const businessTrips = trips.filter(t => t.is_business !== 0).length;
  const privateTrips = totalTrips - businessTrips;
  const totalKm = trips.reduce((sum, t) => sum + (t.distance_km || 0), 0);

  const now = new Date().toISOString();
  upsertReport.run(date, totalTrips, businessTrips, privateTrips, totalKm, notes || '', now);

  const report = getReport.get(date);
  res.json(report);
});

// GET /api/reports?date=YYYY-MM-DD — check if report exists
router.get('/', (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'date query param is required' });
  }

  const report = getReport.get(date);
  if (!report) {
    return res.json({ exists: false, date });
  }

  res.json({ exists: true, ...report });
});

// POST /api/reports/preview-weekly — generate report HTML without sending
// Body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
router.post('/preview-weekly', (req, res) => {
  try {
    const result = generateWeeklyReportHtml(req.body.from, req.body.to);
    res.json(result);
  } catch (err) {
    console.error('[reports] Preview weekly report failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/send-weekly — send weekly report email
// Body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD", html?: "custom HTML" }
router.post('/send-weekly', requireAdmin, async (req, res) => {
  try {
    const result = await sendWeeklyReport(req.body.from, req.body.to, req.body.html);
    res.json(result);
  } catch (err) {
    console.error('[reports] Manual weekly report failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
