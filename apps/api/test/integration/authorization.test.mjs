import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { AppModule } from '../../dist/app.module.js';
import { FirebaseAuthGuard } from '../../dist/common/guards/firebase-auth.guard.js';
import { IdentityModule } from '../../dist/modules/identity/identity.module.js';
import { CurrentAccess, RequireAdminPermission, Roles, RolesGuard } from '../../dist/modules/identity/http/roles.guard.js';
import { fixture } from '../../../../packages/db/test/integration/fixture.mjs';

const PROJECT = 'demo-exam-prep';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }] };

async function token(uid = `uid-${randomUUID()}`) {
  return new SignJWT({ email: `${uid}@example.test`, email_verified: true, name: 'Synthetic User', auth_time: Math.floor(Date.now() / 1000) - 10, firebase: { sign_in_provider: 'password' } })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`).setAudience(PROJECT).setSubject(uid)
    .setIssuedAt().setExpirationTime('1h').sign(privateKey);
}

// Probe routes declared the way domain controllers will use the guard (decorators applied as functions in .mjs).
class Probe {
  student(access) { return access; }
  examiner(access) { return access; }
  staff(access) { return access; }
  finance(access) { return access; }
}
const route = (name, path, decorate) => {
  const descriptor = Object.getOwnPropertyDescriptor(Probe.prototype, name);
  Get(path)(Probe.prototype, name, descriptor);
  decorate?.(Probe.prototype, name, descriptor);
  CurrentAccess()(Probe.prototype, name, 0);
};
route('student', 'student');
route('examiner', 'examiner', Roles('examiner'));
route('staff', 'staff', Roles('qc_reviewer', 'admin'));
route('finance', 'finance', RequireAdminPermission('finance'));
Controller('probe')(Probe);
UseGuards(FirebaseAuthGuard, RolesGuard)(Probe);
class ProbeApp {}
// Domain modules import IdentityModule for the guards, exactly like this.
Module({ imports: [AppModule, IdentityModule], controllers: [Probe] })(ProbeApp);

async function api(t) {
  const db = await fixture(t);
  const saved = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'test', APP_ENV: 'test', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_TEST_JWKS: JSON.stringify(jwks), DATABASE_URL: db.appUrl });
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const app = await NestFactory.create(ProbeApp, { logger: false, abortOnError: false });
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
  /** A signed-in user on a registered device, optionally given roles and admin flags by the owner. */
  const user = async ({ roles, flags = {} } = {}) => {
    const jwt = await token();
    const session = await call('POST', '/identity/session', { jwt, body: { deviceName: 'Laptop', platform: 'web', ageConfirmed: true } });
    assert.equal(session.status, 200);
    const id = session.body.profile.id;
    if (roles) await db.owner.query('UPDATE profiles SET roles = $2::user_role_type[] WHERE id = $1', [id, roles]);
    for (const [flag, on] of Object.entries(flags)) await db.owner.query(`UPDATE profiles SET is_${flag}_admin = $2 WHERE id = $1`, [id, on]);
    return { id, jwt, device: session.body.device.id };
  };
  const as = (u, path) => call('GET', path, { jwt: u.jwt, device: u.device });
  return { db, call, user, as };
}

test('requires a valid token and an active registered device', async (t) => {
  const { call, user } = await api(t);
  assert.equal((await call('GET', '/probe/student')).body.error.code, 'UNAUTHENTICATED');
  const student = await user();
  const noDevice = await call('GET', '/probe/student', { jwt: student.jwt });
  assert.deepEqual([noDevice.status, noDevice.body.error.code], [401, 'DEVICE_NOT_REGISTERED']);
  const otherDevice = await call('GET', '/probe/student', { jwt: student.jwt, device: randomUUID() });
  assert.equal(otherDevice.body.error.code, 'DEVICE_NOT_REGISTERED');
  const ok = await call('GET', '/probe/student', { jwt: student.jwt, device: student.device });
  assert.deepEqual([ok.status, ok.body.profileId, ok.body.roles], [200, student.id, ['student']]);
});

test('role-restricted routes refuse students and accept the right role', async (t) => {
  const { as, user } = await api(t);
  const student = await user();
  for (const path of ['/probe/examiner', '/probe/staff', '/probe/finance']) {
    const res = await as(student, path);
    assert.deepEqual([path, res.status, res.body.error.code], [path, 403, 'FORBIDDEN']);
  }
  const examiner = await user({ roles: ['student', 'examiner'] });
  assert.equal((await as(examiner, '/probe/examiner')).status, 200);
  assert.equal((await as(examiner, '/probe/staff')).status, 403);
  const reviewer = await user({ roles: ['qc_reviewer'] });
  assert.equal((await as(reviewer, '/probe/staff')).status, 200);
  assert.equal((await as(reviewer, '/probe/examiner')).status, 403);
});

test('admin permissions need the admin role plus the specific flag or super admin', async (t) => {
  const { as, user } = await api(t);
  const ops = await user({ roles: ['admin'], flags: { ops: true } });
  assert.equal((await as(ops, '/probe/staff')).status, 200);
  assert.equal((await as(ops, '/probe/finance')).body.error.code, 'FORBIDDEN');
  const finance = await user({ roles: ['admin'], flags: { finance: true } });
  assert.equal((await as(finance, '/probe/finance')).status, 200);
  const superAdmin = await user({ roles: ['admin'], flags: { super: true } });
  assert.equal((await as(superAdmin, '/probe/finance')).status, 200);
  // A finance flag without the admin role grants nothing.
  const flagOnly = await user({ roles: ['student'], flags: { finance: true } });
  assert.equal((await as(flagOnly, '/probe/finance')).status, 403);
});

test('role removal, blocking and device revocation take effect on the next request', async (t) => {
  const { db, as, call, user } = await api(t);
  const examiner = await user({ roles: ['student', 'examiner'] });
  assert.equal((await as(examiner, '/probe/examiner')).status, 200);
  await db.owner.query("UPDATE profiles SET roles = '{student}' WHERE id = $1", [examiner.id]);
  assert.equal((await as(examiner, '/probe/examiner')).status, 403);

  const revoked = await user();
  await call('DELETE', `/me/devices/${revoked.device}`, { jwt: revoked.jwt });
  assert.equal((await as(revoked, '/probe/student')).body.error.code, 'DEVICE_NOT_REGISTERED');

  const blocked = await user({ roles: ['admin'], flags: { super: true } });
  await db.owner.query('UPDATE profiles SET is_blocked = true WHERE id = $1', [blocked.id]);
  const res = await as(blocked, '/probe/finance');
  assert.deepEqual([res.status, res.body.error.code], [403, 'ACCOUNT_BLOCKED']);
});
