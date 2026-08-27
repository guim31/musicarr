import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// La base est un singleton résolu à l'import : le chemin doit être posé avant.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'musicarr-test-'));
process.env.DB_PATH = path.join(TMP_DIR, 'test.db');

type Db = import('better-sqlite3').Database;
let db: Db;
let persistDiscography: typeof import('../src/services/metadata/ReleaseStore.ts').persistDiscography;

before(async () => {
  db = (await import('../src/lib/db.ts')).default as unknown as Db;
  ({ persistDiscography } = await import('../src/services/metadata/ReleaseStore.ts'));
});

beforeEach(() => {
  db.exec('DELETE FROM artist_releases; DELETE FROM artist_cache; DELETE FROM albums; DELETE FROM artists;');
  db.prepare("INSERT INTO artists (id, name) VALUES (1, 'IRON MAIDEN')").run();
});

const okOutcome = (provider: 'musicbrainz' | 'deezer' | 'discogs', count = 0) =>
  ({ provider, status: 'ok' as const, albums: new Array(count).fill({}) });

const release = (over: Partial<Parameters<typeof persistDiscography>[1][number]> = {}) => ({
  releaseKey: 'killers',
  title: 'Killers',
  type: 'album' as const,
  firstReleaseDate: '1981-02-02',
  sources: ['musicbrainz'],
  ...over,
});

test('écrit les sorties et l’état de chaque source', () => {
  const summary = persistDiscography(
    1,
    [release(), release({ releaseKey: 'powerslave', title: 'Powerslave', firstReleaseDate: '1984-09-03' })],
    [
      okOutcome('musicbrainz', 2),
      { provider: 'discogs', status: 'skipped', message: 'Jeton absent', albums: [] },
      { provider: 'deezer', status: 'failed', message: 'HTTP 503', albums: [] },
    ],
    { types: ['album', 'ep'], deep: false },
  );

  assert.equal(summary.total, 2);
  assert.equal(summary.owned, 0);

  const rows = db.prepare('SELECT release_key, title, monitored FROM artist_releases ORDER BY title').all();
  assert.deepEqual(rows, [
    { release_key: 'killers', title: 'Killers', monitored: 1 },
    { release_key: 'powerslave', title: 'Powerslave', monitored: 1 },
  ]);

  // Un fournisseur en échec est enregistré comme tel : sa ligne ne doit plus
  // pouvoir passer pour une collecte réussie.
  const cache = db
    .prepare('SELECT provider, status, message, item_count FROM artist_cache ORDER BY provider')
    .all() as { provider: string; status: string; message: string | null; item_count: number }[];
  assert.deepEqual(
    cache.map(c => [c.provider, c.status]),
    [
      ['deezer', 'failed'],
      ['discogs', 'skipped'],
      ['musicbrainz', 'ok'],
    ],
  );
  assert.equal(cache.find(c => c.provider === 'deezer')?.message, 'HTTP 503');
});

test('surveille les types demandés, pas les autres', () => {
  persistDiscography(
    1,
    [
      release(),
      release({ releaseKey: 'runtothehills', title: 'Run to the Hills', type: 'single' }),
    ],
    [okOutcome('musicbrainz', 2)],
    { types: ['album'], deep: false },
  );

  const rows = db.prepare('SELECT title, monitored FROM artist_releases ORDER BY title').all();
  assert.deepEqual(rows, [
    { title: 'Killers', monitored: 1 },
    { title: 'Run to the Hills', monitored: 0 },
  ]);
});

test('rapproche l’album local et reporte ses identifiants externes', () => {
  // Le titre local porte une mention d'édition : c'est précisément le cas qui
  // faisait afficher « manquant » un album pourtant possédé.
  db.prepare(
    "INSERT INTO albums (id, artist_id, name, status) VALUES (10, 1, 'Killers (Remastered 2015)', 'downloaded')",
  ).run();

  const summary = persistDiscography(
    1,
    [release({ mbid: 'mb-killers', discogsId: '123', deezerId: '456' })],
    [okOutcome('musicbrainz', 1)],
    { types: ['album'], deep: false },
  );

  assert.equal(summary.owned, 1);

  const row = db.prepare('SELECT album_id FROM artist_releases WHERE release_key = ?').get('killers');
  assert.deepEqual(row, { album_id: 10 });

  const album = db.prepare('SELECT mbid, discogs_id, deezer_id FROM albums WHERE id = 10').get();
  assert.deepEqual(album, { mbid: 'mb-killers', discogs_id: '123', deezer_id: '456' });
});

test('privilégie l’album possédé quand deux portent le même titre', () => {
  db.prepare("INSERT INTO albums (id, artist_id, name, status) VALUES (11, 1, 'Killers', 'missing')").run();
  db.prepare("INSERT INTO albums (id, artist_id, name, status) VALUES (12, 1, 'Killers (Deluxe)', 'downloaded')").run();

  persistDiscography(1, [release()], [okOutcome('musicbrainz', 1)], { types: ['album'], deep: false });

  const row = db.prepare('SELECT album_id FROM artist_releases WHERE release_key = ?').get('killers');
  assert.deepEqual(row, { album_id: 12 });
});

test('une deuxième synchronisation ne réinitialise pas le choix de l’utilisateur', () => {
  persistDiscography(1, [release()], [okOutcome('musicbrainz', 1)], { types: ['album'], deep: false });
  db.prepare("UPDATE artist_releases SET monitored = 0 WHERE release_key = 'killers'").run();

  persistDiscography(1, [release()], [okOutcome('musicbrainz', 1)], { types: ['album'], deep: false });

  const row = db.prepare('SELECT monitored FROM artist_releases WHERE release_key = ?').get('killers');
  assert.deepEqual(row, { monitored: 0 });
});

test('conserve la date d’origine et complète les champs manquants', () => {
  persistDiscography(
    1,
    [release({ firstReleaseDate: '1981-02-02', image: undefined })],
    [okOutcome('musicbrainz', 1)],
    { types: ['album'], deep: false },
  );
  persistDiscography(
    1,
    [release({ firstReleaseDate: undefined, image: 'https://exemple/cover.jpg' })],
    [okOutcome('deezer', 1)],
    { types: ['album'], deep: false },
  );

  const row = db
    .prepare('SELECT first_release_date, image FROM artist_releases WHERE release_key = ?')
    .get('killers');
  assert.deepEqual(row, { first_release_date: '1981-02-02', image: 'https://exemple/cover.jpg' });
});

test('nettoie les sorties disparues, dans le périmètre synchronisé seulement', () => {
  persistDiscography(
    1,
    [
      release(),
      release({ releaseKey: 'powerslave', title: 'Powerslave' }),
      release({ releaseKey: 'runtothehills', title: 'Run to the Hills', type: 'single' }),
    ],
    [okOutcome('musicbrainz', 3)],
    { types: ['album', 'single'], deep: false },
  );

  // Nouvelle collecte, limitée aux albums : « Powerslave » a disparu de la
  // source, le single ne fait pas partie du périmètre et doit survivre.
  const summary = persistDiscography(1, [release()], [okOutcome('musicbrainz', 1)], {
    types: ['album'],
    deep: false,
  });

  assert.equal(summary.pruned, 1);
  const titles = (db.prepare('SELECT title FROM artist_releases ORDER BY title').all() as { title: string }[]).map(
    r => r.title,
  );
  assert.deepEqual(titles, ['Killers', 'Run to the Hills']);
});

test('ne supprime jamais une sortie possédée ni un rapprochement manuel', () => {
  db.prepare("INSERT INTO albums (id, artist_id, name, status) VALUES (20, 1, 'Killers', 'downloaded')").run();
  persistDiscography(
    1,
    [release(), release({ releaseKey: 'verrouille', title: 'Verrouillé' })],
    [okOutcome('musicbrainz', 2)],
    { types: ['album'], deep: false },
  );
  db.prepare("UPDATE artist_releases SET locked = 1 WHERE release_key = 'verrouille'").run();

  persistDiscography(1, [], [okOutcome('musicbrainz', 0)], { types: ['album'], deep: false });

  const titles = (db.prepare('SELECT title FROM artist_releases ORDER BY title').all() as { title: string }[]).map(
    r => r.title,
  );
  assert.deepEqual(titles, ['Killers', 'Verrouillé']);
});

test('un rapprochement verrouillé n’est pas écrasé par la synchronisation', () => {
  db.prepare("INSERT INTO albums (id, artist_id, name, status) VALUES (30, 1, 'Killers', 'downloaded')").run();
  db.prepare("INSERT INTO albums (id, artist_id, name, status) VALUES (31, 1, 'Autre', 'downloaded')").run();

  persistDiscography(1, [release()], [okOutcome('musicbrainz', 1)], { types: ['album'], deep: false });
  db.prepare("UPDATE artist_releases SET album_id = 31, locked = 1 WHERE release_key = 'killers'").run();

  persistDiscography(1, [release()], [okOutcome('musicbrainz', 1)], { types: ['album'], deep: false });

  const row = db.prepare('SELECT album_id FROM artist_releases WHERE release_key = ?').get('killers');
  assert.deepEqual(row, { album_id: 31 });
});

test('un identifiant déjà porté par un autre album n’interrompt pas la synchronisation', () => {
  // `albums.mbid` est unique : le report ne doit pas faire échouer la
  // transaction entière.
  db.prepare("INSERT INTO albums (id, artist_id, name, status, mbid) VALUES (40, 1, 'Autre', 'downloaded', 'mb-partage')").run();
  db.prepare("INSERT INTO albums (id, artist_id, name, status) VALUES (41, 1, 'Killers', 'downloaded')").run();

  const summary = persistDiscography(1, [release({ mbid: 'mb-partage' })], [okOutcome('musicbrainz', 1)], {
    types: ['album'],
    deep: false,
  });

  assert.equal(summary.owned, 1);
  const album = db.prepare('SELECT mbid FROM albums WHERE id = 41').get();
  assert.deepEqual(album, { mbid: null });
});

test('une synchronisation sans résultat ne laisse rien d’incohérent', () => {
  const summary = persistDiscography(
    1,
    [],
    [{ provider: 'deezer', status: 'unmatched', message: 'Artiste non identifié', albums: [] }],
    { types: ['album'], deep: false },
  );

  assert.deepEqual(summary, { total: 0, owned: 0, pruned: 0 });
  const cache = db.prepare('SELECT status FROM artist_cache WHERE provider = ?').get('deezer');
  assert.deepEqual(cache, { status: 'unmatched' });
});
