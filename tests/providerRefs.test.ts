import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProviderRef } from '../src/lib/providerRefs.ts';

test('reconnaît une URL MusicBrainz', () => {
  assert.deepEqual(
    parseProviderRef('https://musicbrainz.org/artist/ca891d65-d9b0-4258-89f7-e6ba29d83767'),
    { kind: 'mbid', id: 'ca891d65-d9b0-4258-89f7-e6ba29d83767' },
  );
});

test('reconnaît une URL Discogs, avec ou sans préfixe de langue', () => {
  assert.deepEqual(parseProviderRef('https://www.discogs.com/artist/251595-Daft-Punk'), {
    kind: 'discogsId',
    id: '251595',
  });
  assert.deepEqual(parseProviderRef('https://www.discogs.com/fr/artist/251595-Daft-Punk'), {
    kind: 'discogsId',
    id: '251595',
  });
});

test('reconnaît une URL Deezer', () => {
  assert.deepEqual(parseProviderRef('https://www.deezer.com/fr/artist/27'), {
    kind: 'deezerId',
    id: '27',
  });
});

test('reconnaît un MBID nu, quelle que soit la casse', () => {
  assert.deepEqual(parseProviderRef('CA891D65-D9B0-4258-89F7-E6BA29D83767'), {
    kind: 'mbid',
    id: 'ca891d65-d9b0-4258-89f7-e6ba29d83767',
  });
});

test('un identifiant numérique nu est ambigu sans indication de fournisseur', () => {
  assert.equal(parseProviderRef('251595'), null);
  assert.deepEqual(parseProviderRef('251595', 'discogsId'), { kind: 'discogsId', id: '251595' });
  assert.deepEqual(parseProviderRef('27', 'deezerId'), { kind: 'deezerId', id: '27' });
});

test('refuse ce qu’il ne comprend pas plutôt que de deviner', () => {
  assert.equal(parseProviderRef(''), null);
  assert.equal(parseProviderRef('   '), null);
  assert.equal(parseProviderRef('Daft Punk'), null);
  assert.equal(parseProviderRef('https://example.com/artist/42'), null);
  assert.equal(parseProviderRef('pas-un-mbid'), null);
});
