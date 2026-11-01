import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCrossSiteWrite } from '../src/lib/csrf.ts';

const h = (values: Record<string, string>) => new Headers(values);

test('laisse passer les lectures, quelle que soit leur origine', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(isCrossSiteWrite(method, h({ 'sec-fetch-site': 'cross-site' })), false);
  }
});

test('laisse passer un client sans en-tête d’origine (script cron, curl)', () => {
  assert.equal(isCrossSiteWrite('PATCH', h({ host: 'nas:3005' })), false);
  assert.equal(isCrossSiteWrite('POST', h({})), false);
});

test('s’appuie sur Sec-Fetch-Site quand il est présent', () => {
  assert.equal(isCrossSiteWrite('POST', h({ 'sec-fetch-site': 'same-origin' })), false);
  assert.equal(isCrossSiteWrite('POST', h({ 'sec-fetch-site': 'none' })), false);
  assert.equal(isCrossSiteWrite('POST', h({ 'sec-fetch-site': 'cross-site' })), true);
  // Une autre application du même hôte, sur un autre port, est « same-site ».
  assert.equal(isCrossSiteWrite('DELETE', h({ 'sec-fetch-site': 'same-site' })), true);
});

test('Sec-Fetch-Site prime sur Origin', () => {
  assert.equal(
    isCrossSiteWrite('POST', h({ 'sec-fetch-site': 'cross-site', origin: 'http://nas:3005', host: 'nas:3005' })),
    true,
  );
});

test('à défaut, compare Origin à l’hôte servi', () => {
  assert.equal(isCrossSiteWrite('POST', h({ origin: 'http://nas:3005', host: 'nas:3005' })), false);
  assert.equal(isCrossSiteWrite('POST', h({ origin: 'http://NAS:3005', host: 'nas:3005' })), false);
  assert.equal(isCrossSiteWrite('POST', h({ origin: 'http://evil.example', host: 'nas:3005' })), true);
  // Même hôte, autre port : autre origine.
  assert.equal(isCrossSiteWrite('POST', h({ origin: 'http://nas:8080', host: 'nas:3005' })), true);
});

test('accepte l’hôte transmis par un proxy', () => {
  assert.equal(
    isCrossSiteWrite(
      'POST',
      h({ origin: 'https://musique.example', host: 'localhost:3000', 'x-forwarded-host': 'musique.example' }),
    ),
    false,
  );
});

test('refuse une origine opaque', () => {
  assert.equal(isCrossSiteWrite('POST', h({ origin: 'null', host: 'nas:3005' })), true);
});
