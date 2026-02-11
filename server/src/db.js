import Database from 'better-sqlite3';
import config from './config.js';

const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    registration     TEXT NOT NULL,
    trip_date        TEXT NOT NULL,
    start_time       TEXT NOT NULL,
    end_time         TEXT NOT NULL,
    start_address    TEXT,
    end_address      TEXT,
    start_lat        REAL,
    start_lng        REAL,
    end_lat          REAL,
    end_lng          REAL,
    distance_km      REAL,
    duration_minutes REAL,
    max_speed        REAL,
    avg_speed        REAL,
    idle_time_minutes REAL,
    trip_type        TEXT,
    cartrack_title   TEXT,
    cartrack_notes   TEXT,
    user_description TEXT DEFAULT '',
    raw_json         TEXT,
    synced_at        TEXT NOT NULL,
    updated_at       TEXT,
    UNIQUE(registration, start_time)
  );
`);

// Migration: add is_business column if missing
const tripsColumns = db.prepare("PRAGMA table_info(trips)").all();
if (!tripsColumns.find(c => c.name === 'is_business')) {
  db.exec(`ALTER TABLE trips ADD COLUMN is_business INTEGER DEFAULT 1`);
}

// Migration: add merged_into column if missing
if (!tripsColumns.find(c => c.name === 'merged_into')) {
  db.exec(`ALTER TABLE trips ADD COLUMN merged_into INTEGER`);
}

// Migration: add merge_snapshot column if missing
if (!tripsColumns.find(c => c.name === 'merge_snapshot')) {
  db.exec(`ALTER TABLE trips ADD COLUMN merge_snapshot TEXT`);
}

// New table: trip_spares
db.exec(`
  CREATE TABLE IF NOT EXISTS trip_spares (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    spare_name  TEXT NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
  );
`);

// New table: daily_reports
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date     TEXT NOT NULL UNIQUE,
    total_trips     INTEGER NOT NULL DEFAULT 0,
    business_trips  INTEGER NOT NULL DEFAULT 0,
    private_trips   INTEGER NOT NULL DEFAULT 0,
    total_km        REAL NOT NULL DEFAULT 0,
    notes           TEXT DEFAULT '',
    created_at      TEXT NOT NULL
  );
`);

export default db;
