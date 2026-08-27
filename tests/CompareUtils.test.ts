import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CompareUtils } from '../src/lib/CompareUtils.ts';

const { normalize, releaseKey, stripEditionQualifiers, sameRelease } = CompareUtils;

test('normalize : dé-accentue, met en minuscules et retire la ponctuation', () => {
  assert.equal(CompareUtils.normalize('Éléphant'), 'elephant');
  assert.equal(CompareUtils.normalize('  AC/DC  '), 'acdc');
  assert.equal(CompareUtils.normalize('Sgt. Pepper’s'), 'sgtpeppers');
  assert.equal(CompareUtils.normalize(null), '');
  assert.equal(CompareUtils.normalize(undefined), '');
  assert.equal(CompareUtils.normalize(''), '');
});

test("normalize : retire l'article de tête, et lui seul", () => {
  // Ce qui doit fusionner : même nom, article de tête en plus.
  assert.equal(CompareUtils.normalize('The Beatles'), CompareUtils.normalize('Beatles'));
  assert.equal(CompareUtils.normalize('The Wall'), CompareUtils.normalize('Wall'));
  assert.equal(CompareUtils.normalize("L'Impératrice"), CompareUtils.normalize('Imperatrice'));
  assert.equal(CompareUtils.normalize('Les Rita Mitsouko'), CompareUtils.normalize('Rita Mitsouko'));
});

test('normalize : ne fusionne plus des titres réellement différents (régression)', () => {
  // Ces couples entraient en collision avant la correction, parce que les
  // articles étaient retirés *partout* dans la chaîne et que « l' » était
  // retiré même au milieu d'un mot.
  const collisionsCorrigees: [string, string][] = [
    ['Kid A', 'Kid'],
    ['Ol’ Dirty Bastard', 'O Dirty Bastard'],
    ['Take a Bow', 'Take Bow'],
    ['Rock the Casbah', 'Rock Casbah'],
  ];
  for (const [a, b] of collisionsCorrigees) {
    assert.notEqual(
      CompareUtils.normalize(a),
      CompareUtils.normalize(b),
      `« ${a} » ne doit plus être confondu avec « ${b} »`,
    );
  }
});

test('normalize : la fusion par article de tête est délibérée', () => {
  // Contrepartie assumée du retrait de l'article de tête : ces couples
  // fusionnent, et c'est voulu — les dossiers de bibliothèque omettent
  // couramment l'article. Test présent pour que le jour où quelqu'un veut
  // changer d'avis, il tombe dessus.
  const fusionsVoulues: [string, string][] = [
    ['The Beatles', 'Beatles'],
    ['La Femme', 'Femme'],
    ['An Anthology', 'Anthology'],
    ['Die Mensch-Maschine', 'Mensch-Maschine'],
  ];
  for (const [a, b] of fusionsVoulues) {
    assert.equal(
      CompareUtils.normalize(a),
      CompareUtils.normalize(b),
      `« ${a} » doit être rapproché de « ${b} »`,
    );
  }
});

test('normalize : aligne les conjonctions', () => {
  assert.equal(CompareUtils.normalize('Simon & Garfunkel'), CompareUtils.normalize('Simon and Garfunkel'));
  assert.equal(CompareUtils.normalize('Serge et Jane'), CompareUtils.normalize('Serge & Jane'));
});

test("normalize : un titre entièrement composé d'un article reste comparable", () => {
  // « A » (Jethro Tull), « The The » : retirer l'article viderait la clé.
  assert.equal(CompareUtils.normalize('A'), 'a');
  assert.notEqual(CompareUtils.normalize('The The'), '');
});

test('stripEditionQualifiers : retire les mentions entre parenthèses ou crochets', () => {
  assert.equal(stripEditionQualifiers('Killers (Remastered 2015)').trim(), 'killers');
  assert.equal(stripEditionQualifiers('Discovery [Deluxe Edition]').trim(), 'discovery');
  assert.equal(stripEditionQualifiers('Nevermind (2011)').trim(), 'nevermind');
  assert.equal(stripEditionQualifiers('Thriller (Bonus Track Version)').trim(), 'thriller');
});

test('stripEditionQualifiers : retire les suffixes après tiret, même empilés', () => {
  assert.equal(stripEditionQualifiers('Aladdin Sane - 2013 Remaster').trim(), 'aladdin sane');
  assert.equal(stripEditionQualifiers('Rumours - Deluxe - Remastered 2013').trim(), 'rumours');
});

test('stripEditionQualifiers : ne touche pas à ce qui distingue deux sorties', () => {
  // « Live », « Remixes », « Acoustic » désignent d'autres disques, pas
  // d'autres pressages du même disque.
  assert.match(stripEditionQualifiers('Alchemy (Live)'), /live/);
  assert.match(stripEditionQualifiers('Homework (The Remixes)'), /remixes/);
  assert.match(stripEditionQualifiers('Unplugged (Acoustic Version)'), /acoustic/);
  assert.match(stripEditionQualifiers('Live at Wembley'), /wembley/);
});

test('releaseKey : les éditions d’un même album produisent une seule clé', () => {
  const memeAlbum = [
    'Killers',
    'Killers (Remastered 2015)',
    'Killers [Deluxe Edition]',
    'Killers - 1998 Remaster',
    'Killers (Explicit)',
    'KILLERS (Bonus Track Version)',
  ];
  const cles = new Set(memeAlbum.map(t => CompareUtils.releaseKey(t)));
  assert.equal(cles.size, 1, `attendu 1 clé, obtenu ${[...cles].join(' / ')}`);
  assert.equal([...cles][0], 'killers');
});

test('releaseKey : cas réels de doublons signalés dans l’audit', () => {
  assert.ok(sameRelease('Discovery', 'Discovery (Deluxe)'));
  assert.ok(sameRelease('Live After Death', 'Live After Death (2020 Remaster)'));
  assert.ok(
    sameRelease('Random Access Memories', 'Random Access Memories (10th Anniversary Edition)'),
  );
  assert.ok(sameRelease('The Dark Side of the Moon', 'Dark Side of the Moon [2011 Remaster]'));
});

test('releaseKey : deux sorties distinctes gardent deux clés', () => {
  const distincts: [string, string][] = [
    ['Alchemy', 'Alchemy (Live)'],
    ['Homework', 'Homework (The Remixes)'],
    ['Kid A', 'Kid'],
    ['Vol. 1', 'Vol. 2'],
    ['Led Zeppelin II', 'Led Zeppelin III'],
  ];
  for (const [a, b] of distincts) {
    assert.notEqual(
      CompareUtils.releaseKey(a),
      CompareUtils.releaseKey(b),
      `« ${a} » et « ${b} » doivent rester distincts`,
    );
  }
});

test('releaseKey : un titre réduit à une mention d’édition reste lui-même', () => {
  assert.notEqual(CompareUtils.releaseKey('Remastered'), '');
  assert.notEqual(CompareUtils.releaseKey('(Deluxe Edition)'), '');
});

test('compare : tolérant à la casse et à la ponctuation, jamais sur du vide', () => {
  assert.ok(CompareUtils.compare('Daft Punk', 'daft-punk'));
  assert.ok(!CompareUtils.compare('', ''));
  assert.ok(!CompareUtils.compare('Air', 'Earth'));
});

// Garde-fou : la référence déstructurée doit rester utilisable (méthodes statiques).
test('les méthodes statiques ne dépendent pas de `this` dynamique', () => {
  assert.equal(normalize('The Cure'), 'cure');
  assert.equal(releaseKey('Disintegration (Remastered)'), 'disintegration');
});
