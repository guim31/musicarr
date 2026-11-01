import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// La base est un singleton résolu à l'import : le chemin doit être posé avant.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'musicarr-test-'));
process.env.DB_PATH = path.join(TMP_DIR, 'test.db');

type Db = import('better-sqlite3').Database;
type Cleanup = (targetPath: string | undefined, foundAlbumIds: number[], foundTrackPaths: string[]) => void;
let db: Db;
let cleanup: Cleanup;

const ROOT = path.join(path.sep, 'music', 'ABBA');
const GOLD = path.join(ROOT, 'Gold');
const GOLD_HITS = path.join(ROOT, 'Gold_Greatest_Hits');
const GOLDX = path.join(ROOT, 'GoldX');

before(async () => {
  db = (await import('../src/lib/db.ts')).default as unknown as Db;
  const { LibraryService } = await import('../src/services/library.ts');
  cleanup = (LibraryService as unknown as { cleanupTransaction: Cleanup }).cleanupTransaction;
});

beforeEach(() => {
  db.exec('DELETE FROM tracks; DELETE FROM albums; DELETE FROM artists;');
  db.prepare("INSERT INTO artists (id, name) VALUES (1, 'ABBA')").run();
  const album = db.prepare("INSERT INTO albums (id, artist_id, name, path, status) VALUES (?, 1, ?, ?, 'downloaded')");
  const track = db.prepare('INSERT INTO tracks (album_id, title, number, disc, path) VALUES (?, ?, 1, 1, ?)');
  album.run(1, 'Gold', GOLD);
  album.run(2, 'Gold Greatest Hits', GOLD_HITS);
  album.run(3, 'GoldX', GOLDX);
  track.run(1, 'Dancing Queen', path.join(GOLD, '01-Dancing_Queen.flac'));
  track.run(2, 'Waterloo', path.join(GOLD_HITS, '01-Waterloo.flac'));
  track.run(3, 'SOS', path.join(GOLDX, '01-SOS.flac'));
});

test('le scan partiel d’un dossier ne touche pas ses voisins de même préfixe', () => {
  // Le dossier « Gold » a été vidé : seul son album doit passer manquant.
  cleanup(GOLD, [], []);

  const albums = db.prepare('SELECT id, status FROM albums ORDER BY id').all();
  assert.deepEqual(albums, [
    { id: 1, status: 'missing' },
    { id: 2, status: 'downloaded' },
    { id: 3, status: 'downloaded' },
  ]);
  const tracks = (db.prepare('SELECT title FROM tracks ORDER BY title').all() as { title: string }[]).map(t => t.title);
  assert.deepEqual(tracks, ['SOS', 'Waterloo']);
});

test('le scan partiel conserve les pistes retrouvées, y compris en sous-dossier', () => {
  const nested = path.join(GOLD, 'CD2', '01-Fernando.flac');
  db.prepare("INSERT INTO tracks (album_id, title, number, disc, path) VALUES (1, 'Fernando', 1, 2, ?)").run(nested);

  cleanup(`${GOLD}${path.sep}`, [1], [nested]);

  const tracks = (db.prepare('SELECT title FROM tracks ORDER BY title').all() as { title: string }[]).map(t => t.title);
  assert.deepEqual(tracks, ['Fernando', 'SOS', 'Waterloo']);
  const gold = db.prepare('SELECT status FROM albums WHERE id = 1').get();
  assert.deepEqual(gold, { status: 'downloaded' });
});
