import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BACKUP_SUFFIX, discardUpgradeBackups, rollbackUpgrade } from '../src/lib/upgradeBackup.ts';

let dir: string;
const write = (name: string, content: string) => fs.writeFileSync(path.join(dir, name), content);
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
const list = () => fs.readdirSync(dir).sort();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'musicarr-upgrade-'));
});

test('restaure les originaux, y compris par-dessus un fichier partiel du même nom', () => {
  write(`01-Intro.mp3${BACKUP_SUFFIX}`, 'original-1');
  write(`02-Outro.mp3${BACKUP_SUFFIX}`, 'original-2');
  write('01-Intro.mp3', 'partiel');

  const restored = rollbackUpgrade(dir, [path.join(dir, '01-Intro.mp3')]);

  assert.equal(restored, 2);
  assert.deepEqual(list(), ['01-Intro.mp3', '02-Outro.mp3']);
  assert.equal(read('01-Intro.mp3'), 'original-1');
});

test('retire les fichiers écrits sous un autre nom, et eux seuls', () => {
  write(`Intro.mp3${BACKUP_SUFFIX}`, 'original');
  write('01-Intro.flac', 'nouveau');
  write('folder.jpg', 'pochette');

  rollbackUpgrade(dir, [path.join(dir, '01-Intro.flac')]);

  assert.deepEqual(list(), ['Intro.mp3', 'folder.jpg']);
});

test('sans sauvegarde, ne supprime rien : ce n’était pas une mise à niveau', () => {
  write('01-Intro.flac', 'nouveau');
  assert.equal(rollbackUpgrade(dir, [path.join(dir, '01-Intro.flac')]), 0);
  assert.deepEqual(list(), ['01-Intro.flac']);
});

test('ignore un fichier écrit hors du dossier de l’album', () => {
  const outside = path.join(os.tmpdir(), `musicarr-outside-${process.pid}.txt`);
  fs.writeFileSync(outside, 'x');
  write(`a.mp3${BACKUP_SUFFIX}`, 'original');
  rollbackUpgrade(dir, [outside]);
  assert.equal(fs.existsSync(outside), true);
  fs.unlinkSync(outside);
});

test('un dossier absent n’est pas une erreur', () => {
  assert.equal(rollbackUpgrade(path.join(dir, 'absent')), 0);
});

test('retire les sauvegardes après une mise à niveau réussie', () => {
  write(`a.mp3${BACKUP_SUFFIX}`, 'original');
  write('a.flac', 'nouveau');
  discardUpgradeBackups(dir);
  assert.deepEqual(list(), ['a.flac']);
});
