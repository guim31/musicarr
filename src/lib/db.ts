import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './LogService';

logger.init();

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'musicarr.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH, { timeout: 10000 });
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS indexers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prowlarrId INTEGER UNIQUE,
    name TEXT NOT NULL,
    protocol TEXT,
    enabled INTEGER DEFAULT 1,
    syncEnabled INTEGER DEFAULT 1,
    config TEXT
  );

  CREATE TABLE IF NOT EXISTS artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE,
    mbid TEXT UNIQUE, -- MusicBrainz ID
    discogs_id TEXT UNIQUE, -- Discogs ID
    image TEXT,
    monitored INTEGER DEFAULT 1,
    metadata TEXT, -- JSON blob for extra info
    UNIQUE(name)
  );

  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    album_artist TEXT, -- Explicit ALBUM_ARTIST tag
    mbid TEXT UNIQUE, -- MusicBrainz ID
    discogs_id TEXT UNIQUE, -- Discogs ID
    release_date TEXT,
    quality TEXT, -- FLAC, MP3, etc.
    path TEXT,
    barcode TEXT, -- UPC/EAN
    label TEXT,   -- Publisher
    monitored INTEGER DEFAULT 1,
    status TEXT DEFAULT 'missing', -- 'downloaded', 'missing', 'wanted'
    type TEXT, -- 'album', 'single', 'ep', 'compilation'
    metadata TEXT,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    UNIQUE(artist_id, name)
  );

  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    artist TEXT, -- Specific track artist (for compilations)
    number INTEGER,
    track_total INTEGER,
    disc INTEGER,
    disc_total INTEGER,
    duration REAL,
    bpm REAL,
    isrc TEXT,
    quality TEXT,
    bitrate INTEGER,
    path TEXT,
    metadata TEXT,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    UNIQUE(album_id, title, number, disc)
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'download', 'move', 'scan', 'sync'
    status TEXT, -- 'pending', 'completed', 'failed', 'processing'
    title TEXT, -- Album name or file name
    artist_id INTEGER,
    album_id INTEGER,
    message TEXT, -- Friendly description
    details TEXT, -- JSON blob for more info
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS artist_cache (
    artist_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    data TEXT NOT NULL, -- JSON blob of results
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (artist_id, provider),
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
  );
`);

// Migrations for existing databases
const migrate = () => {
  const columns = {
    albums: ['album_artist', 'barcode', 'label', 'type'],
    tracks: ['artist', 'bpm', 'isrc', 'track_total', 'disc_total']
  };

  for (const [table, cols] of Object.entries(columns)) {
    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    const existingCols = tableInfo.map(c => c.name);
    
    for (const col of cols) {
      if (!existingCols.includes(col)) {
        console.log(`[DB] Migration: Adding column ${col} to table ${table}`);
        const type = (col === 'bpm' || col === 'track_total' || col === 'disc_total') ? 'INTEGER' : 'TEXT';
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      }
    }
  }
};

migrate();

export default db;
