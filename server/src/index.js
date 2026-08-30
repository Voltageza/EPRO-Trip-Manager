import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { existsSync, mkdirSync } from 'fs';
import config from './config.js';
import './db.js'; // ensure schema is created on startup
import tripsRouter from './routes/trips.js';
import syncRouter from './routes/sync.js';
import reportsRouter from './routes/reports.js';
import vehiclesRouter from './routes/vehicles.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import locationsRouter from './routes/locations.js';
import customersRouter from './routes/customers.js';
import jobsRouter from './routes/jobs.js';
import microsoftRouter from './routes/microsoft.js';
import webhooksRouter from './routes/webhooks.js';
import { requireAuth } from './middleware/auth.js';
import { syncTrips, yesterday } from './services/tripSync.js';
import { sendReminder } from './services/emailService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Ensure uploads directory exists
const uploadsDir = config.uploadDir;
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Static file serving for uploads
app.use('/uploads', express.static(uploadsDir));

// API routes
app.use('/api/auth', authRouter);                   // public
app.use('/api/trips', requireAuth, tripsRouter);
app.use('/api/sync', requireAuth, syncRouter);
app.use('/api/reports', requireAuth, reportsRouter);
app.use('/api/vehicles', requireAuth, vehiclesRouter);
app.use('/api/locations', requireAuth, locationsRouter);
app.use('/api/customers', requireAuth, customersRouter);
app.use('/api/jobs', requireAuth, jobsRouter);
app.use('/api/microsoft', microsoftRouter);          // has own auth per-route (callback must be public)
app.use('/api/webhooks', webhooksRouter);            // incoming webhooks (secret-based auth)
app.use('/api/admin', adminRouter);                 // has own auth middleware

// Serve call-logger in production
const callLoggerDist = resolve(__dirname, '../../call-logger/dist');
app.use('/call-logger', express.static(callLoggerDist));
app.get('/call-logger/*', (req, res) => {
  res.sendFile(resolve(callLoggerDist, 'index.html'));
});

// Serve built React app in production (trip manager — catch-all)
const clientDist = resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
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

app.listen(config.port, config.host, () => {
  console.log(`[server] E-Pro Trip Manager running on http://${config.host}:${config.port}`);
  console.log(`[cron] Auto-sync scheduled: ${config.syncCron}`);
  console.log(`[cron] Email reminder scheduled: ${config.reminderCron}`);
});
