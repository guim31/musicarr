import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './LogService';
import { redactSecrets } from './redact';
import { rollbackUpgrade } from './upgradeBackup';

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

  -- Cache brut par fournisseur. Sert désormais au diagnostic, plus à
  -- l'affichage : l'interface lit artist_releases. Les colonnes status,
  -- scope et message rendent explicite ce que contient chaque ligne : une
  -- ligne périmée d'un fournisseur en échec était auparavant indiscernable
  -- d'une ligne fraîche.
  CREATE TABLE IF NOT EXISTS artist_cache (
    artist_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    data TEXT NOT NULL,          -- JSON brut renvoyé par le fournisseur
    status TEXT DEFAULT 'ok',    -- 'ok', 'failed', 'unmatched', 'skipped'
    scope TEXT,                  -- JSON { types, deep } utilisé pour cette collecte
    message TEXT,                -- Motif d'échec, le cas échéant
    item_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (artist_id, provider),
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
  );

  -- Sorties connues d'un artiste, fusionnées entre fournisseurs.
  --
  -- C'est le changement structurant de l'audit fonctionnel : une discographie
  -- n'était jusqu'ici qu'un blob JSON, rapproché à la volée par comparaison de
  -- chaînes à chaque affichage. Sans entité, rien ne pouvait être surveillé,
  -- rapproché durablement, ni listé comme manquant.
  CREATE TABLE IF NOT EXISTS artist_releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    release_key TEXT NOT NULL,      -- clé canonique, éditions confondues
    title TEXT NOT NULL,            -- titre d'affichage retenu
    type TEXT NOT NULL,             -- album|ep|single|compilation|live|remix|soundtrack|demo|appearance
    first_release_date TEXT,
    image TEXT,
    mbid TEXT,
    discogs_id TEXT,
    deezer_id TEXT,
    sources TEXT,                   -- JSON des fournisseurs ayant vu la sortie
    album_id INTEGER,               -- album local rapproché, si possédé
    monitored INTEGER DEFAULT 0,
    locked INTEGER DEFAULT 0,       -- rapprochement corrigé à la main : ne pas écraser
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(artist_id, release_key),
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
  );
`);

// Migrations for existing databases
const migrate = () => {
  // Colonne -> définition SQL. Ajoutée seulement si absente : `ALTER TABLE`
  // est le seul moyen d'ajouter une colonne en SQLite, et il n'est pas
  // idempotent.
  const columns: Record<string, Record<string, string>> = {
    albums: {
      album_artist: 'TEXT',
      barcode: 'TEXT',
      label: 'TEXT',
      type: 'TEXT',
      // Identifiants externes du rapprochement : sans eux, « possédé ou
      // manquant » ne reposait que sur la comparaison de chaînes.
      deezer_id: 'TEXT',
    },
    tracks: {
      artist: 'TEXT',
      bpm: 'INTEGER',
      isrc: 'TEXT',
      track_total: 'INTEGER',
      disc_total: 'INTEGER',
    },
    artists: {
      // Stocké jusqu'ici dans le blob `metadata`, donc ni indexable ni
      // contraignable.
      deezer_id: 'TEXT',
    },
    artist_cache: {
      status: "TEXT DEFAULT 'ok'",
      scope: 'TEXT',
      message: 'TEXT',
      item_count: 'INTEGER DEFAULT 0',
    },
  };

  for (const [table, cols] of Object.entries(columns)) {
    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const existingCols = tableInfo.map(c => c.name);

    for (const [col, definition] of Object.entries(cols)) {
      if (!existingCols.includes(col)) {
        console.log(`[DB] Migration : ajout de la colonne ${col} sur ${table}`);
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
      }
    }
  }

  // Reprise des identifiants Deezer déjà présents dans le blob `metadata`.
  const migrated = db
    .prepare(
      `UPDATE artists
          SET deezer_id = json_extract(metadata, '$.deezerId')
        WHERE deezer_id IS NULL
          AND metadata IS NOT NULL
          AND json_valid(metadata)
          AND json_extract(metadata, '$.deezerId') IS NOT NULL`,
    )
    .run();
  if (migrated.changes > 0) {
    console.log(`[DB] Migration : ${migrated.changes} identifiant(s) Deezer repris depuis metadata`);
  }
};

// Sous verrou d'écriture, colonnes relues à l'intérieur : `next build` charge les
// routes dans plusieurs workers qui ouvrent la même base en même temps. Sans cela,
// deux d'entre eux voient une colonne absente, le second `ALTER TABLE` échoue et
// le build casse au hasard.
db.transaction(migrate).immediate();

// Purge des secrets déjà persistés. Les erreurs Discogs reprenaient l'URL
// complète, jeton compris, et ce message était enregistré dans
// `artist_cache.message` (renvoyé par GET /api/artists/:id/discography) et
// dans `activity` (renvoyé par GET /api/activity). Idempotent : une ligne déjà
// masquée n'est pas réécrite.
const scrubPersistedSecrets = () => {
  const targets: [table: string, key: string, column: string][] = [
    ['artist_cache', 'rowid', 'message'],
    ['activity', 'id', 'message'],
    ['activity', 'id', 'details'],
  ];
  let scrubbed = 0;
  for (const [table, key, column] of targets) {
    const rows = db
      .prepare(
        `SELECT ${key} AS k, ${column} AS v FROM ${table}
          WHERE ${column} LIKE '%token=%' OR ${column} LIKE '%apikey=%' OR ${column} LIKE '%arl=%'`,
      )
      .all() as { k: number; v: string }[];
    const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${key} = ?`);
    for (const row of rows) {
      const clean = redactSecrets(row.v);
      if (clean !== row.v) {
        update.run(clean, row.k);
        scrubbed += 1;
      }
    }
  }
  if (scrubbed > 0) {
    console.log(`[DB] Migration : secrets masqués dans ${scrubbed} message(s) enregistré(s)`);
  }
};

try {
  scrubPersistedSecrets();
} catch (e) {
  console.error('[DB] Purge des secrets enregistrés impossible :', (e as Error).message);
}

// Index sur les colonnes filtrées en permanence par l'interface et le scan.
//
// Volontairement absents : albums(artist_id) et tracks(album_id). Les
// contraintes UNIQUE(artist_id, name) et UNIQUE(album_id, title, number, disc)
// créent déjà des index dont ces colonnes sont le préfixe gauche : SQLite s'en
// sert. Les dupliquer ne ferait que ralentir les écritures pendant les scans.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_albums_status   ON albums(status);
  CREATE INDEX IF NOT EXISTS idx_albums_path     ON albums(path);
  CREATE INDEX IF NOT EXISTS idx_tracks_path     ON tracks(path);
  CREATE INDEX IF NOT EXISTS idx_activity_status ON activity(status);
  CREATE INDEX IF NOT EXISTS idx_activity_ts     ON activity(timestamp DESC);

  -- La page « Manquants » interroge les sorties surveillées non possédées de
  -- toute la bibliothèque : sans index, c'est un balayage complet.
  CREATE INDEX IF NOT EXISTS idx_releases_missing ON artist_releases(monitored, album_id);
  CREATE INDEX IF NOT EXISTS idx_releases_album   ON artist_releases(album_id);
`);

/**
 * Mises à niveau Deemix interrompues par un redémarrage : les originaux sont
 * restés renommés en `.upgrade_backup`, extension que le scan ne lit pas, et
 * l'album paraissait vide jusqu'à une intervention manuelle. On les remet en
 * place avant de clore l'activité.
 */
const recoverInterruptedUpgrades = () => {
  const libraryRow = db.prepare("SELECT value FROM settings WHERE key = 'library_path'").get() as
    | { value: string }
    | undefined;
  if (!libraryRow?.value) return;
  const library = path.resolve(libraryRow.value);

  const rows = db
    .prepare(
      `SELECT id, details FROM activity
        WHERE type = 'download' AND status = 'processing' AND details LIKE '%"backupDir"%'`,
    )
    .all() as { id: number; details: string }[];

  for (const row of rows) {
    try {
      const details = JSON.parse(row.details) as { backupDir?: unknown; written?: unknown };
      if (typeof details.backupDir !== 'string') continue;
      const dir = path.resolve(details.backupDir);
      // Le chemin vient de la base : jamais hors de la bibliothèque.
      if (!dir.startsWith(library + path.sep)) continue;
      const written = Array.isArray(details.written)
        ? details.written.filter((f): f is string => typeof f === 'string')
        : [];
      const restored = rollbackUpgrade(dir, written);
      if (restored > 0) {
        console.log(`[DB] Mise à niveau interrompue : ${restored} fichier(s) original(aux) restauré(s) dans ${dir}`);
      }
    } catch (e) {
      console.error(`[DB] Restauration impossible pour l'activité ${row.id} :`, (e as Error).message);
    }
  }
};

// Nettoyage au démarrage : supprime les verrous de scan bloqués et marque les activités orphelines comme échouées
try {
  recoverInterruptedUpgrades();
} catch (e) {
  console.error('[DB] Reprise des mises à niveau interrompues impossible :', (e as Error).message);
}

try {
  db.prepare("DELETE FROM settings WHERE key = 'scan_progress'").run();
  db.prepare("UPDATE activity SET status = 'failed', message = 'Interrompu par le redémarrage du serveur' WHERE status = 'processing'").run();
} catch (e: any) {
  console.error('[DB] Erreur lors du nettoyage de démarrage :', e.message);
}

export default db;
