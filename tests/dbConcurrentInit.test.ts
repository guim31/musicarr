import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROUNDS = 4;
const PROCESSES = 8;

function openDatabase(dbPath: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      ['--import', './tests/alias-hook.mjs', '--input-type=module', '-e', "await import('./src/lib/db.ts');"],
      { env: { ...process.env, DB_PATH: dbPath }, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('close', code => resolve({ code, stderr }));
  });
}

/**
 * `next build` charge les routes dans plusieurs workers, qui ouvrent la même base
 * neuve en même temps. Sans verrou, deux d'entre eux voyaient une colonne absente
 * et le second `ALTER TABLE` échouait : le build de l'image cassait au hasard.
 */
test('plusieurs processus peuvent initialiser la même base neuve en même temps', async () => {
  for (let round = 0; round < ROUNDS; round += 1) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'musicarr-init-'));
    const dbPath = path.join(dir, 'test.db');
    try {
      const results = await Promise.all(Array.from({ length: PROCESSES }, () => openDatabase(dbPath)));
      const failures = results.filter(result => result.code !== 0);
      assert.equal(failures.length, 0, failures[0]?.stderr);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
