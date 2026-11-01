import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress } from '../src/lib/publicAddress.ts';

test('accepte les adresses publiques', () => {
  for (const ip of ['8.8.8.8', '151.101.1.69', '2a00:1450:4007:80e::200e', '[2606:4700::1111]']) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test('refuse la boucle locale, les réseaux privés et le lien local', () => {
  for (const ip of [
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fd12:3456::1',
    'fe80::1',
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test('refuse une IPv4 privée déguisée en IPv6', () => {
  assert.equal(isPublicAddress('::ffff:127.0.0.1'), false);
  assert.equal(isPublicAddress('::ffff:7f00:1'), false);
  assert.equal(isPublicAddress('::ffff:192.168.1.1'), false);
  assert.equal(isPublicAddress('64:ff9b::10.0.0.1'), false);
  assert.equal(isPublicAddress('::ffff:8.8.8.8'), true);
});

test('refuse ce qui n’est pas une adresse IP', () => {
  assert.equal(isPublicAddress('localhost'), false);
  assert.equal(isPublicAddress(''), false);
  assert.equal(isPublicAddress('2130706433'), false);
});
