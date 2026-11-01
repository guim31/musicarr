import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseThumbWidth, THUMB_WIDTHS } from '../src/lib/coverThumbs.ts';

test('les largeurs prévues sont acceptées', () => {
  for (const width of THUMB_WIDTHS) assert.equal(parseThumbWidth(String(width)), width);
});

test('toute autre largeur est refusée : un client ne doit pas pouvoir remplir le disque', () => {
  for (const raw of ['0', '100', '99999', '-320', '320.5', 'abc', '', null, '320;rm -rf']) {
    assert.equal(parseThumbWidth(raw), null, String(raw));
  }
});
