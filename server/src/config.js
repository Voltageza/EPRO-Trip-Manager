import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

export default {
  port: parseInt(process.env.PORT || '3001', 10),
  // Bind loopback in production so nginx is the only way in.
  host: process.env.HOST || '0.0.0.0',
  // An absolute DB_PATH/UPLOAD_DIR wins over the in-repo default, which keeps
  // production data outside the code tree where a deploy cannot touch it.
  dbPath: resolve(__dirname, '../..', process.env.DB_PATH || './trips.db'),
  uploadDir: resolve(__dirname, '../..', process.env.UPLOAD_DIR || './server/uploads'),

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

  jwt: {
    secret: process.env.JWT_SECRET || 'epro-default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  syncCron: process.env.SYNC_CRON || '0 6 * * *',
  reminderCron: process.env.REMINDER_CRON || '0 7 * * *',
  weeklyReportCron: process.env.WEEKLY_REPORT_CRON || '0 6 * * 1',

  // Make.com webhook for To-Do sync
  makecomWebhookUrl: process.env.MAKECOM_WEBHOOK_URL || '',
  makecomWebhookSecret: process.env.MAKECOM_WEBHOOK_SECRET || '',
};
