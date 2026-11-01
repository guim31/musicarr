import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLogArg, redactSecrets } from '../src/lib/redact.ts';

test('masque les secrets passés en paramètre d’URL', () => {
  assert.equal(
    redactSecrets('http://nas:8080/api?mode=queue&output=json&apikey=abc123'),
    'http://nas:8080/api?mode=queue&output=json&apikey=***',
  );
  assert.equal(
    redactSecrets('HTTP 500 sur https://api.discogs.com/artists/1/releases?token=XyZ&page=2'),
    'HTTP 500 sur https://api.discogs.com/artists/1/releases?token=***&page=2',
  );
});

test('masque les en-têtes porteurs de secrets', () => {
  assert.equal(redactSecrets('{"X-Api-Key":"abc123","Accept":"json"}'), '{"X-Api-Key":"***","Accept":"json"}');
  assert.equal(redactSecrets('Cookie: arl=deadbeef; sid=fr123'), 'Cookie: ***');
  assert.equal(redactSecrets('{"Authorization":"Discogs token=abc"}'), '{"Authorization":"***"}');
});

test('laisse intact un texte sans secret', () => {
  const text = 'Scan terminé : 2200 albums, 468 artistes';
  assert.equal(redactSecrets(text), text);
});

test('réduit une erreur axios à sa requête, sans configuration ni clé', () => {
  const error = Object.assign(new Error('Request failed with status code 500'), {
    name: 'AxiosError',
    isAxiosError: true,
    config: {
      method: 'get',
      url: 'http://nas:8080/api?mode=status&apikey=secret-sab',
      headers: { 'X-Api-Key': 'secret-prowlarr' },
    },
    response: { status: 500 },
  });
  const text = formatLogArg(error);
  assert.match(text, /AxiosError: Request failed with status code 500/);
  assert.match(text, /GET http:\/\/nas:8080\/api\?mode=status&apikey=\*\*\* → HTTP 500/);
  assert.doesNotMatch(text, /secret-/);
});

test('ne lève pas sur un objet circulaire', () => {
  const circular: Record<string, unknown> = { a: 1 };
  circular.self = circular;
  assert.equal(formatLogArg(circular), '[object Object]');
});
