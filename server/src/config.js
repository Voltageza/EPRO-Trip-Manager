import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

export default {
  port: parseInt(process.env.PORT || '3001', 10),
  dbPath: resolve(__dirname, '../../trips.db'),

  cartrack: {
    baseUrl: process.env.CARTRACK_BASE_URL || 'https://fleetapi-za.cartrack.com/rest',
    username: process.env.CARTRACK_USERNAME || '',
    password: process.env.CARTRACK_PASSWORD || '',
    registration: process.env.VEHICLE_REGISTRATION || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || '',
    to: process.env.EMAIL_TO || '',
  },

  syncCron: process.env.SYNC_CRON || '0 6 * * *',
  reminderCron: process.env.REMINDER_CRON || '0 7 * * *',
  weeklyReportCron: process.env.WEEKLY_REPORT_CRON || '0 6 * * 1',
};
