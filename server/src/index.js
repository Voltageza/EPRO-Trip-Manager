import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import config from './config.js';
import './db.js'; // ensure schema is created on startup
import tripsRouter from './routes/trips.js';
import syncRouter from './routes/sync.js';
import reportsRouter from './routes/reports.js';
import vehiclesRouter from './routes/vehicles.js';
import { syncTrips, yesterday } from './services/tripSync.js';
import { sendReminder, sendWeeklyReport } from './services/emailService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/trips', tripsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/vehicles', vehiclesRouter);

// Serve built React app in production
const clientDist = resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(resolve(clientDist, 'index.html'));
});

// Cron: auto-sync yesterday's trips
cron.schedule(config.syncCron, async () => {
  console.log('[cron] Running auto-sync...');
  try {
    const result = await syncTrips(yesterday(), yesterday());
    console.log(`[cron] Auto-sync complete: ${result.synced} trips`);
  } catch (err) {
    console.error('[cron] Auto-sync failed:', err.message);
  }
});

// Cron: email reminder
cron.schedule(config.reminderCron, async () => {
  console.log('[cron] Checking for unfilled trips...');
  try {
    await sendReminder();
  } catch (err) {
    console.error('[cron] Email reminder failed:', err.message);
  }
});

// Cron: weekly report (Monday mornings)
cron.schedule(config.weeklyReportCron, async () => {
  console.log('[cron] Sending weekly report...');
  try {
    await sendWeeklyReport();
  } catch (err) {
    console.error('[cron] Weekly report failed:', err.message);
  }
});

app.listen(config.port, () => {
  console.log(`[server] E-Pro Trip Manager running on http://localhost:${config.port}`);
  console.log(`[cron] Auto-sync scheduled: ${config.syncCron}`);
  console.log(`[cron] Email reminder scheduled: ${config.reminderCron}`);
  console.log(`[cron] Weekly report scheduled: ${config.weeklyReportCron}`);
});
