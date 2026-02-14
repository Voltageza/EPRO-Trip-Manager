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

// Vehicles table
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    registration TEXT PRIMARY KEY,
    description  TEXT,
    make         TEXT,
    model        TEXT,
    year         TEXT,
    is_active    INTEGER DEFAULT 1,
    raw_json     TEXT,
    last_synced  TEXT
  );
`);

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

// Locations table (custom GPS-based names)
db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
`);

// Migration: add default_vehicle column to users if missing
const usersColumns = db.prepare("PRAGMA table_info(users)").all();
if (!usersColumns.find(c => c.name === 'default_vehicle')) {
  db.exec(`ALTER TABLE users ADD COLUMN default_vehicle TEXT`);
}

// Customers table
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
`);

// Jobs table
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    assigned_to TEXT,
    description TEXT,
    special_instructions TEXT,
    status TEXT NOT NULL DEFAULT 'unassigned',
    priority TEXT NOT NULL DEFAULT 'normal',
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT,
    completed_at TEXT
  );
`);

// Migration: remove FK on assigned_to (was vehicles.registration, now plain text for electrician names)
const jobsFKInfo = db.prepare("PRAGMA foreign_key_list(jobs)").all();
if (jobsFKInfo.some(fk => fk.from === 'assigned_to' && fk.table === 'vehicles')) {
  db.exec(`
    CREATE TABLE jobs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      assigned_to TEXT,
      description TEXT,
      special_instructions TEXT,
      status TEXT NOT NULL DEFAULT 'unassigned',
      priority TEXT NOT NULL DEFAULT 'normal',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT,
      completed_at TEXT
    );
    INSERT INTO jobs_new SELECT * FROM jobs;
    DROP TABLE jobs;
    ALTER TABLE jobs_new RENAME TO jobs;
  `);
}

// Job photos table
db.exec(`
  CREATE TABLE IF NOT EXISTS job_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Job-trip linking table (for future use)
db.exec(`
  CREATE TABLE IF NOT EXISTS job_trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    UNIQUE(job_id, trip_id)
  );
`);

// Electricians table
db.exec(`
  CREATE TABLE IF NOT EXISTS electricians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
`);

export default db;
