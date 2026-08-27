import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromDiscogsFormat,
  fromDiscogsRole,
  fromDeezer,
  fromMusicBrainz,
  toMusicBrainzPrimaryTypes,
  coerceTypes,
  typePriority,
} from '../src/services/metadata/releaseTypes.ts';

test('Discogs : le support n’est plus confondu avec le type (régression)', () => {
  // Le bug : `vinyl` était testé avant `single`, donc tout maxi 45 tours
  // devenait un album — et se retrouvait dédupliqué séparément de la même
  // sortie en CD, d'où deux entrées pour un seul disque.
  assert.equal(fromDiscogsFormat('Vinyl, 12", 45 RPM, Single'), 'single');
  assert.equal(fromDiscogsFormat('12", Single, Promo'), 'single');
  assert.equal(fromDiscogsFormat('Vinyl, LP, Album'), 'album');
  assert.equal(fromDiscogsFormat('CD, Album, Reissue'), 'album');
  assert.equal(fromDiscogsFormat('Vinyl, 12", EP'), 'ep');
  assert.equal(fromDiscogsFormat('CD, Compilation, Album'), 'compilation');
});

test('Discogs : un format absent n’est pas deviné', () => {
  // Les entrées `master` n'ont pas de format. Les classer « album » par défaut
  // était une supposition silencieuse ; on laisse les autres fournisseurs
  // trancher.
  assert.equal(fromDiscogsFormat(undefined), null);
  assert.equal(fromDiscogsFormat(''), null);
  assert.equal(fromDiscogsFormat('   '), null);
  assert.equal(fromDiscogsFormat('Vinyl, 12"'), null);
});

test('Discogs : les rôles de crédit sont distingués des sorties de l’artiste', () => {
  assert.equal(fromDiscogsRole('Main'), 'main');
  assert.equal(fromDiscogsRole(undefined), 'main');
  assert.equal(fromDiscogsRole('Appearance'), 'appearance');
  assert.equal(fromDiscogsRole('TrackAppearance'), 'appearance');
  assert.equal(fromDiscogsRole('Featuring'), 'appearance');

  // Ceux-ci passaient tous pour des albums de l'artiste.
  for (const role of ['Producer', 'Co-producer', 'Remix', 'Arranged By', 'Written-By', 'Mixed By']) {
    assert.equal(fromDiscogsRole(role), 'credit', `${role} doit être un crédit`);
  }
});

test('MusicBrainz : les types secondaires sont tous traités', () => {
  assert.equal(fromMusicBrainz('Album', []), 'album');
  assert.equal(fromMusicBrainz('Album', ['Live']), 'live');
  assert.equal(fromMusicBrainz('Album', ['Remix']), 'remix');
  assert.equal(fromMusicBrainz('Album', ['Soundtrack']), 'soundtrack');
  assert.equal(fromMusicBrainz('Album', ['Demo']), 'demo');
  assert.equal(fromMusicBrainz('Album', ['DJ-mix']), 'compilation');
  assert.equal(fromMusicBrainz('Album', ['Compilation']), 'compilation');
  assert.equal(fromMusicBrainz('Single', ['Split']), 'appearance');
  assert.equal(fromMusicBrainz('EP', []), 'ep');
  assert.equal(fromMusicBrainz(null, []), 'album');
});

test('MusicBrainz : un live compilé reste avant tout un live', () => {
  assert.equal(fromMusicBrainz('Album', ['Live', 'Compilation']), 'live');
});

test('MusicBrainz : ce qui n’est pas de la musique est écarté', () => {
  for (const secondary of ['Interview', 'Spokenword', 'Audiobook', 'Audio drama']) {
    assert.equal(fromMusicBrainz('Album', [secondary]), null, `${secondary} doit être écarté`);
  }
});

test('MusicBrainz : le filtre serveur couvre les types demandés', () => {
  assert.deepEqual(toMusicBrainzPrimaryTypes(['album', 'ep']).sort(), ['album', 'ep']);
  assert.deepEqual(toMusicBrainzPrimaryTypes(['single']), ['single']);
  // live / compilation / remix sont des release-groups « album » côté MB.
  assert.deepEqual(toMusicBrainzPrimaryTypes(['live', 'compilation']), ['album']);
  assert.deepEqual(toMusicBrainzPrimaryTypes(['appearance']).sort(), ['album', 'ep', 'single']);
});

test('Deezer : record_type traduit, avec repli sur album', () => {
  assert.equal(fromDeezer('album'), 'album');
  assert.equal(fromDeezer('single'), 'single');
  assert.equal(fromDeezer('ep'), 'ep');
  assert.equal(fromDeezer('compile'), 'compilation');
  assert.equal(fromDeezer(null), 'album');
  assert.equal(fromDeezer('inconnu'), 'album');
});

test('coerceTypes : assainit un filtre venu de l’extérieur', () => {
  assert.deepEqual(coerceTypes(['album', 'ep']), ['album', 'ep']);
  assert.deepEqual(coerceTypes(['album', 'album']), ['album']);
  // Rien d'exploitable = pas de filtre, surtout pas « aucun type ».
  assert.equal(coerceTypes([]), null);
  assert.equal(coerceTypes(['n’importe quoi']), null);
  assert.equal(coerceTypes('album'), null);
  assert.equal(coerceTypes(undefined), null);
  assert.equal(coerceTypes({ types: ['album'] }), null);
});

test('typePriority : l’album l’emporte sur le single en cas de désaccord', () => {
  assert.ok(typePriority('album') > typePriority('single'));
  assert.ok(typePriority('album') > typePriority('appearance'));
  assert.ok(typePriority('ep') > typePriority('single'));
  assert.equal(typePriority(null), 0);
  assert.equal(typePriority('inconnu'), 0);
});
