import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'musicarr.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
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
    image TEXT,
    monitored INTEGER DEFAULT 1,
    metadata TEXT, -- JSON blob for extra info
    UNIQUE(name)
  );

  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    mbid TEXT UNIQUE, -- MusicBrainz ID
    release_date TEXT,
    quality TEXT, -- FLAC, MP3, etc.
    path TEXT,
    monitored INTEGER DEFAULT 1,
    status TEXT DEFAULT 'missing', -- 'downloaded', 'missing', 'wanted'
    metadata TEXT,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    UNIQUE(artist_id, name)
  );

  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    number INTEGER,
    disc INTEGER,
    duration REAL,
    quality TEXT,
    bitrate INTEGER,
    path TEXT,
    metadata TEXT,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    UNIQUE(album_id, title, number, disc)
  );
`);

export default db;
