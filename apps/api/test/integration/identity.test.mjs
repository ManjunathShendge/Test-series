import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { AppModule } from '../../dist/app.module.js';
import { fixture } from '../../../../packages/db/test/integration/fixture.mjs';

// Tokens are signed with a local key that the API trusts only under NODE_ENV/APP_ENV=test.
const PROJECT = 'demo-exam-prep';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }] };
const foreign = await generateKeyPair('RS256');

async function token({ uid = `uid-${randomUUID()}`, email = `${uid}@example.test`, verified = true, audience = PROJECT, key = privateKey, expires = '1h' } = {}) {
  const jwt = await new SignJWT({ email, email_verified: verified, name: 'Synthetic Student', auth_time: Math.floor(Date.now() / 1000) - 10, firebase: { sign_in_provider: 'password' } })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`).setAudience(audience).setSubject(uid)
    .setIssuedAt().setExpirationTime(expires).sign(key);
  return { jwt, uid, email };
}

/** The real API (built dist) against an isolated, migrated database, as the restricted app role. */
async function api(t) {
  const db = await fixture(t);
  const saved = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'test', APP_ENV: 'test', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_TEST_JWKS: JSON.stringify(jwks), DATABASE_URL: db.appUrl });
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/v1`;
  t.after(async () => { await app.close(); process.env = saved; });
  const call = async (method, path, { jwt, device, body } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (jwt) headers.authorization = `Bearer ${jwt}`;
    if (device) headers['x-device-id'] = device;
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  const session = (jwt, extra = {}) => call('POST', '/identity/session', { jwt, body: { deviceName: 'Pixel 9', platform: 'android', ageConfirmed: true, ...extra } });
  return { db, call, session };
}

test('rejects missing, malformed, foreign, wrong-audience and expired tokens', async (t) => {
  const { call, session } = await api(t);
  assert.equal((await call('GET', '/me')).status, 401);
  assert.equal((await call('GET', '/me', { jwt: 'not-a-token' })).status, 401);
  for (const bad of [await token({ key: foreign.privateKey }), await token({ audience: 'another-project' }), await token({ expires: '-1m' })]) {
    const res = await session(bad.jwt);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  }
});

test('email sign-in requires a verified email and 18+ confirmation', async (t) => {
  const { session } = await api(t);
  const unverified = await session((await token({ verified: false })).jwt);
  assert.deepEqual([unverified.status, unverified.body.error.code], [403, 'EMAIL_NOT_VERIFIED']);
  const { jwt } = await token();
  const noAge = await session(jwt, { ageConfirmed: false });
  assert.deepEqual([noAge.status, noAge.body.error.code], [400, 'VALIDATION_FAILED']);
  const extra = await session(jwt, { roles: ['admin'] });
  assert.equal(extra.status, 400, 'unknown fields are rejected');
});

test('first sign-in creates a student profile and a server-issued device; returning reuses both', async (t) => {
  const { session, db } = await api(t);
  const { jwt, uid, email } = await token();
  const first = await session(jwt);
  assert.equal(first.status, 200);
  assert.deepEqual([first.body.profile.email, first.body.profile.roles, first.body.profile.onboarded], [email, ['student'], false]);
  assert.deepEqual([first.body.device.isCurrent, first.body.device.isActive, first.body.device.platform], [true, true, 'android']);
  const again = await session(jwt, { deviceId: first.body.device.id, deviceName: 'Pixel 9 Pro' });
  assert.deepEqual([again.body.profile.id, again.body.device.id, again.body.device.name], [first.body.profile.id, first.body.device.id, 'Pixel 9 Pro']);
  const rows = (await db.owner.query('SELECT p.firebase_uid, count(d.id)::int AS devices FROM profiles p JOIN user_devices d ON d.user_id = p.id GROUP BY 1')).rows;
  assert.deepEqual(rows, [{ firebase_uid: uid, devices: 1 }]);
  // A device id that is not the user's is ignored; a new one is issued instead.
  const other = await session((await token()).jwt);
  const hijack = await session(jwt, { deviceId: other.body.device.id });
  assert.notEqual(hijack.body.device.id, other.body.device.id);
});

test('a third device is refused with the devices to remove; removing one lets it in', async (t) => {
  const { session, call } = await api(t);
  const { jwt } = await token();
  const phone = (await session(jwt, { deviceName: 'Phone' })).body.device;
  await session(jwt, { deviceName: 'Tablet', platform: 'ios' });
  const third = await session(jwt, { deviceName: 'Laptop', platform: 'web' });
  assert.deepEqual([third.status, third.body.error.code], [409, 'DEVICE_LIMIT_REACHED']);
  assert.deepEqual(third.body.error.details.activeDevices.map((d) => d.name).sort(), ['Phone', 'Tablet']);
  // The blocked device may revoke one of the others without being registered itself.
  assert.equal((await call('DELETE', `/me/devices/${phone.id}`, { jwt })).status, 204);
  const retry = await session(jwt, { deviceName: 'Laptop', platform: 'web' });
  assert.equal(retry.status, 200);
  // The revoked device is signed out until it signs in again (and then the limit applies).
  const stale = await call('GET', '/me', { jwt, device: phone.id });
  assert.deepEqual([stale.status, stale.body.error.code], [401, 'DEVICE_NOT_REGISTERED']);
});

test('the same email under a different sign-in is not merged', async (t) => {
  const { session } = await api(t);
  await session((await token({ uid: 'firebase-a', email: 'shared@example.test' })).jwt);
  const second = await session((await token({ uid: 'firebase-b', email: 'shared@example.test' })).jwt);
  assert.deepEqual([second.status, second.body.error.code], [409, 'ACCOUNT_EXISTS_WITH_DIFFERENT_SIGN_IN']);
});

test('profile reads and onboarding updates need a registered device and accept only profile fields', async (t) => {
  const { session, call, db } = await api(t);
  const { jwt } = await token();
  const device = (await session(jwt)).body.device.id;
  assert.equal((await call('GET', '/me', { jwt })).body.error.code, 'DEVICE_NOT_REGISTERED');
  assert.equal((await call('GET', '/me', { jwt, device })).status, 200);
  const updated = await call('PATCH', '/me', { jwt, device, body: { fullName: 'Asha Rao', preferredLanguage: 'hi', preparationStage: 'final-lap' } });
  assert.deepEqual([updated.status, updated.body.fullName, updated.body.preferredLanguage, updated.body.onboarded], [200, 'Asha Rao', 'hi', true]);
  for (const body of [{ roles: ['admin'] }, {}, { preparationStage: 'expert' }, { targetExamIds: [randomUUID()] }]) {
    const res = await call('PATCH', '/me', { jwt, device, body });
    assert.deepEqual([res.status, res.body.error.code], [400, 'VALIDATION_FAILED'], JSON.stringify(body));
  }
  const category = (await db.owner.query("INSERT INTO exam_categories (name, slug) VALUES ('SSC', 'ssc') RETURNING id")).rows[0].id;
  const exam = (await db.owner.query("INSERT INTO exams (category_id, name, slug) VALUES ($1, 'SSC CGL', 'ssc-cgl') RETURNING id", [category])).rows[0].id;
  const withExam = await call('PATCH', '/me', { jwt, device, body: { targetExamIds: [exam, exam] } });
  assert.deepEqual(withExam.body.targetExamIds, [exam]);
  assert.equal((await db.owner.query("SELECT roles::text FROM profiles WHERE full_name = 'Asha Rao'")).rows[0].roles, '{student}');
});

test('device list marks the current device; users cannot revoke other users\' devices', async (t) => {
  const { session, call } = await api(t);
  const a = await token(); const b = await token();
  const aPhone = (await session(a.jwt, { deviceName: 'A phone' })).body.device.id;
  await session(a.jwt, { deviceName: 'A tablet' });
  const bPhone = (await session(b.jwt)).body.device.id;
  const list = await call('GET', '/me/devices', { jwt: a.jwt, device: aPhone });
  assert.deepEqual(list.body.items.map((d) => [d.name, d.isCurrent]).sort(), [['A phone', true], ['A tablet', false]]);
  const res = await call('DELETE', `/me/devices/${bPhone}`, { jwt: a.jwt });
  assert.deepEqual([res.status, res.body.error.code], [404, 'NOT_FOUND']);
  assert.equal((await call('GET', '/me', { jwt: b.jwt, device: bPhone })).status, 200);
});

test('blocked accounts cannot sign in', async (t) => {
  const { session, db } = await api(t);
  const { jwt, uid } = await token();
  await session(jwt);
  await db.owner.query('UPDATE profiles SET is_blocked = true WHERE firebase_uid = $1', [uid]);
  const res = await session(jwt);
  assert.deepEqual([res.status, res.body.error.code], [403, 'ACCOUNT_BLOCKED']);
});
