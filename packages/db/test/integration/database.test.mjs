import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase, checkDatabase, transaction, enqueueJob, claimJob, finishJob } from '../../dist/index.js';
import { migrateDatabase } from '../../dist/migrate.js';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'exam-sqlite-'));
  const url = pathToFileURL(join(directory, 'test.sqlite')).href;
  migrateDatabase(url);
  const db = createDatabase(url);
  t.after(() => { db.close(); assert.ok(directory.startsWith(join(tmpdir(), 'exam-sqlite-'))); rmSync(directory, { recursive: true }); });
  return { db, url };
}
function user(db) { db.prepare('INSERT INTO users (id,email,created_at) VALUES (?,?,?)').run('u1','synthetic@example.test',0); }
function order(db) { user(db); db.prepare('INSERT INTO billing_orders VALUES (?,?,?,?,?,?,?)').run('o1','u1','checkout-1',100,'INR','pending',0); }

test('migrations are repeatable and WAL/foreign keys survive reopen', (t) => {
  const { db, url } = fixture(t);
  migrateDatabase(url);
  checkDatabase(db);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n, 1);
  assert.throws(() => db.prepare('INSERT INTO user_roles VALUES (?,?)').run('missing','student'), /FOREIGN KEY/);
});
test('SQLite persists user roles and hashed session references', (t) => {
  const { db, url } = fixture(t); user(db);
  db.prepare('INSERT INTO user_roles VALUES (?,?)').run('u1','student');
  db.prepare('INSERT INTO sessions VALUES (?,?,?,NULL)').run('hashed-token','u1',1000);
  const second = createDatabase(url);
  try { assert.equal(second.prepare('SELECT user_id FROM sessions WHERE token_hash=?').get('hashed-token').user_id, 'u1'); }
  finally { second.close(); }
});
test('billing idempotency, integer money and append-only ledger are enforced', (t) => {
  const { db } = fixture(t); order(db);
  assert.throws(() => db.prepare('INSERT INTO billing_orders VALUES (?,?,?,?,?,?,?)').run('o2','u1','checkout-1',100,'INR','pending',0), /UNIQUE/);
  assert.throws(() => db.prepare('UPDATE billing_orders SET amount_paise=1.5').run(), /INTEGER/);
  db.prepare('INSERT INTO ledger_entries VALUES (?,?,?,?,?)').run('l1','o1','verified-event',100,0);
  assert.throws(() => db.exec('UPDATE ledger_entries SET amount_paise=0'), /append-only/);
  assert.throws(() => db.exec('DELETE FROM ledger_entries'), /append-only/);
});
test('billing and audit changes roll back together', (t) => {
  const { db } = fixture(t); order(db);
  assert.throws(() => transaction(db, () => {
    db.exec("UPDATE billing_orders SET status='paid'");
    db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run('a1','u1','paid','{}',0);
    throw new Error('simulated interruption');
  }), /interruption/);
  assert.equal(db.prepare('SELECT status FROM billing_orders').get().status,'pending');
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit_events').get().n,0);
});
test('audit history cannot be rewritten or deleted', (t) => {
  const { db } = fixture(t);
  db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run('a1',null,'bootstrap','{}',0);
  assert.throws(() => db.exec("UPDATE audit_events SET action='other'"), /append-only/);
  assert.throws(() => db.exec('DELETE FROM audit_events'), /append-only/);
});
test('file contents are stored in SQLite and round trip byte-for-byte', (t) => {
  const { db, url } = fixture(t);
  const content = Buffer.from([0,255,1,128]);
  db.prepare('INSERT INTO stored_files VALUES (?,?,?,?,?)').run('f1',null,'application/octet-stream',content,0);
  const second = createDatabase(url);
  try { assert.deepEqual(Buffer.from(second.prepare('SELECT content FROM stored_files WHERE id=?').get('f1').content),content); }
  finally { second.close(); }
});
test('job deduplication, exclusive claims, lease recovery and stale acknowledgements', (t) => {
  const { db, url } = fixture(t);
  enqueueJob(db,'test',{},'event-1',0); enqueueJob(db,'test',{},'event-1',0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM jobs').get().n,1);
  const second = createDatabase(url);
  try {
    const first = claimJob(db,'test',0,100);
    assert.equal(claimJob(second,'test',50,100),undefined);
    const recovered = claimJob(second,'test',100,100);
    assert.equal(recovered.id,first.id);
    assert.equal(finishJob(db,first.id,first.lease_token,101),false);
    assert.equal(finishJob(second,recovered.id,recovered.lease_token,101),true);
  } finally { second.close(); }
});
test('schema mismatch fails readiness', (t) => {
  const { db } = fixture(t);
  db.exec("UPDATE bootstrap_state SET version=999 WHERE id='schema'");
  assert.throws(() => checkDatabase(db), /incompatible/);
});
