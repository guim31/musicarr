import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDiscographies } from '../src/services/metadata/ReleaseMerger.ts';

test('fusionne la même sortie vue par les trois fournisseurs', () => {
  // Le symptôme d'origine : trois colonnes non fusionnées, donc un album
  // affiché trois fois.
  const merged = mergeDiscographies([
    { provider: 'musicbrainz', albums: [{ name: 'Killers', mbid: 'mb-1', releaseDate: '1981-02-02', type: 'album' }] },
    { provider: 'deezer', albums: [{ name: 'Killers (2015 Remaster)', deezerId: '42', releaseDate: '2015-06-01', type: 'album' }] },
    { provider: 'discogs', albums: [{ name: 'Killers', discogsId: '99', releaseDate: '1981' }] },
  ]);

  assert.equal(merged.length, 1);
  const [release] = merged;
  assert.equal(release.title, 'Killers');
  assert.equal(release.mbid, 'mb-1');
  assert.equal(release.deezerId, '42');
  assert.equal(release.discogsId, '99');
  assert.deepEqual(release.sources, ['musicbrainz', 'deezer', 'discogs']);
});

test('retient la date de sortie d’origine, pas celle de la réédition', () => {
  const [release] = mergeDiscographies([
    { provider: 'deezer', albums: [{ name: 'Rumours (Deluxe)', releaseDate: '2013-01-01', type: 'album' }] },
    { provider: 'musicbrainz', albums: [{ name: 'Rumours', releaseDate: '1977-02-04', type: 'album' }] },
  ]);
  assert.equal(release.firstReleaseDate, '1977-02-04');
});

test('écarte les dates aberrantes au lieu de les propager', () => {
  const [release] = mergeDiscographies([
    { provider: 'discogs', albums: [{ name: 'Nevermind', releaseDate: '0000', type: 'album' }] },
    { provider: 'musicbrainz', albums: [{ name: 'Nevermind', releaseDate: '1991-09-24', type: 'album' }] },
  ]);
  assert.equal(release.firstReleaseDate, '1991-09-24');
});

test('le type vient du fournisseur le plus fiable qui en connaît un', () => {
  // Discogs classait tout maxi vinyle en album ; MusicBrainz fait autorité.
  const [release] = mergeDiscographies([
    { provider: 'discogs', albums: [{ name: 'Sandstorm', discogsId: '1', type: 'album' }] },
    { provider: 'musicbrainz', albums: [{ name: 'Sandstorm', mbid: 'x', type: 'single' }] },
  ]);
  assert.equal(release.type, 'single');
});

test('un type inconnu partout retombe sur album', () => {
  const [release] = mergeDiscographies([
    { provider: 'discogs', albums: [{ name: 'Inconnu', discogsId: '7' }] },
  ]);
  assert.equal(release.type, 'album');
});

test('la pochette vient de la source qui en sert la meilleure', () => {
  const [release] = mergeDiscographies([
    { provider: 'musicbrainz', albums: [{ name: 'Discovery', image: 'https://coverartarchive.org/x/front', type: 'album' }] },
    { provider: 'discogs', albums: [{ name: 'Discovery', image: 'https://img.discogs.com/thumb.jpg' }] },
    { provider: 'deezer', albums: [{ name: 'Discovery', image: 'https://e-cdns.dzcdn.net/1000x1000.jpg', type: 'album' }] },
  ]);
  assert.match(release.image ?? '', /dzcdn/);
});

test('le titre d’affichage est celui sans mention d’édition', () => {
  const [release] = mergeDiscographies([
    { provider: 'deezer', albums: [{ name: 'Discovery (Deluxe Edition)', type: 'album' }] },
    { provider: 'musicbrainz', albums: [{ name: 'Discovery', type: 'album' }] },
  ]);
  assert.equal(release.title, 'Discovery');
});

test('deux sorties distinctes restent deux lignes', () => {
  const merged = mergeDiscographies([
    {
      provider: 'musicbrainz',
      albums: [
        { name: 'Alchemy', type: 'album', releaseDate: '1984' },
        { name: 'Alchemy (Live)', type: 'live', releaseDate: '1984' },
        { name: 'Love Over Gold', type: 'album', releaseDate: '1982' },
      ],
    },
  ]);
  assert.equal(merged.length, 3);
});

test('trie du plus récent au plus ancien, sans date en dernier', () => {
  const merged = mergeDiscographies([
    {
      provider: 'musicbrainz',
      albums: [
        { name: 'Ancien', type: 'album', releaseDate: '1970' },
        { name: 'Sans date', type: 'album' },
        { name: 'Récent', type: 'album', releaseDate: '2020' },
      ],
    },
  ]);
  assert.deepEqual(merged.map(r => r.title), ['Récent', 'Ancien', 'Sans date']);
});

test('ignore les entrées sans titre exploitable', () => {
  const merged = mergeDiscographies([
    { provider: 'deezer', albums: [{ name: '', type: 'album' }, { name: '   ', type: 'album' }] },
  ]);
  assert.equal(merged.length, 0);
});

test('une liste vide ne casse rien', () => {
  assert.deepEqual(mergeDiscographies([]), []);
  assert.deepEqual(mergeDiscographies([{ provider: 'deezer', albums: [] }]), []);
});
