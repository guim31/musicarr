import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safePathSegment } from '../src/lib/pathSegment.ts';

test('conserve un nom ordinaire', () => {
  assert.equal(safePathSegment('IRON_MAIDEN'), 'IRON_MAIDEN');
  assert.equal(safePathSegment('Sigur Rós'), 'Sigur Rós');
  assert.equal(safePathSegment('...And Justice for All'), '...And Justice for All');
});

test('un séparateur ne crée plus de sous-dossier', () => {
  assert.equal(safePathSegment('AC/DC'), 'AC_DC');
  assert.equal(safePathSegment('Live 1977\\1978'), 'Live 1977_1978');
});

test('neutralise les tentatives de remontée', () => {
  assert.equal(safePathSegment('../../tmp'), '.._.._tmp');
  assert.equal(safePathSegment('..'), 'UNKNOWN');
  assert.equal(safePathSegment('.'), 'UNKNOWN');
  assert.equal(safePathSegment(' ... '), 'UNKNOWN');
});

test('retire les caractères de contrôle', () => {
  assert.equal(safePathSegment('A\u0000B\nC'), 'A_B_C');
});

test('se replie sur la valeur par défaut pour un nom vide', () => {
  assert.equal(safePathSegment(''), 'UNKNOWN');
  assert.equal(safePathSegment(null, 'Sans titre'), 'Sans titre');
  assert.equal(safePathSegment('///'), '_');
});
