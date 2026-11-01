import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameServiceUrl, normalizeServiceUrl } from '../src/lib/serviceUrl.ts';

test('neutralise la casse, le port par défaut et la barre finale', () => {
  assert.equal(isSameServiceUrl('http://NAS:8080/', 'http://nas:8080'), true);
  assert.equal(isSameServiceUrl('https://prowlarr.example:443/', 'https://prowlarr.example'), true);
  assert.equal(isSameServiceUrl('http://nas:8080/sabnzbd/', 'http://nas:8080/sabnzbd'), true);
});

test('distingue un autre hôte, port, chemin ou protocole', () => {
  assert.equal(isSameServiceUrl('http://nas:8080', 'http://evil.example:8080'), false);
  assert.equal(isSameServiceUrl('http://nas:8080', 'http://nas:9090'), false);
  assert.equal(isSameServiceUrl('http://nas:8080/a', 'http://nas:8080/b'), false);
  assert.equal(isSameServiceUrl('http://nas:8080', 'https://nas:8080'), false);
});

test('une valeur absente ou invalide ne correspond à rien', () => {
  assert.equal(normalizeServiceUrl(''), null);
  assert.equal(normalizeServiceUrl(undefined), null);
  assert.equal(normalizeServiceUrl('pas une url'), null);
  assert.equal(normalizeServiceUrl('file:///etc/passwd'), null);
  assert.equal(isSameServiceUrl(undefined, undefined), false);
});
