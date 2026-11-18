import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/env.js';

const local = {
  APP_ENV: 'local',
  PUBLIC_WEB_ORIGIN: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://exam_app:local_app_only@127.0.0.1:15432/exam_prep',
  FIREBASE_PROJECT_ID: 'demo-exam-prep',
  FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
};

describe('environment boundary', () => {
  it('accepts local emulators without provider credentials', () => {
    expect(parseEnvironment(local).API_PORT).toBe(3001);
  });
  it.each(['staging', 'production'])('rejects emulators in %s', (APP_ENV) => {
    expect(() => parseEnvironment({ ...local, APP_ENV })).toThrow('Emulator');
  });
  it('rejects emulator flags under production NODE_ENV', () => {
    expect(() => parseEnvironment({ ...local, NODE_ENV: 'production' })).toThrow('Emulator');
  });
  it.each(['0', '65536', 'abc'])('rejects invalid port %s', (API_PORT) => {
    expect(() => parseEnvironment({ ...local, API_PORT })).toThrow('API_PORT');
  });
  it('rejects wildcard CORS and non-database URLs', () => {
    expect(() => parseEnvironment({ ...local, CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
    expect(() => parseEnvironment({ ...local, DATABASE_URL: 'https://localhost' })).toThrow(
      'DATABASE_URL',
    );
  });
  it('rejects SQLite file URLs and URLs without a database name', () => {
    expect(() => parseEnvironment({ ...local, DATABASE_URL: 'file:./data/x.sqlite' })).toThrow(
      'DATABASE_URL',
    );
    expect(() => parseEnvironment({ ...local, DATABASE_URL: 'postgresql://h:5432' })).toThrow(
      'DATABASE_URL',
    );
    expect(() => parseEnvironment({ ...local, WORKER_DATABASE_URL: 'mysql://h/db' })).toThrow(
      'WORKER_DATABASE_URL',
    );
  });
  it('requires verified database TLS in deployed environments', () => {
    const staging = {
      ...local,
      APP_ENV: 'staging',
      FIREBASE_PROJECT_ID: 'exam-prep-staging',
      FIREBASE_AUTH_EMULATOR_HOST: undefined,
      CORS_ORIGINS: 'https://staging.example.test',
      PUBLIC_WEB_ORIGIN: 'https://staging.example.test',
    };
    expect(() => parseEnvironment(staging)).toThrow('DATABASE_CA_CERT_PATH');
    expect(parseEnvironment({ ...staging, DATABASE_CA_CERT_PATH: 'ca.pem' }).APP_ENV).toBe('staging');
  });
  it('does not expose secrets in validation errors', () => {
    expect(() => parseEnvironment({ ...local, DATABASE_URL: 'private-token' })).not.toThrow(
      'private-token',
    );
    expect(() => parseEnvironment({ ...local, DATABASE_URL: 'private-token' })).toThrow(
      'DATABASE_URL',
    );
  });
  it('requires a valid Firebase project id', () => {
    expect(() => parseEnvironment({ ...local, FIREBASE_PROJECT_ID: undefined })).toThrow('FIREBASE_PROJECT_ID');
    expect(() => parseEnvironment({ ...local, FIREBASE_PROJECT_ID: 'Bad Project!' })).toThrow('FIREBASE_PROJECT_ID');
  });
  it('accepts test signing keys only when NODE_ENV and APP_ENV are both test', () => {
    const jwks = '{"keys":[]}';
    expect(parseEnvironment({ ...local, NODE_ENV: 'test', APP_ENV: 'test', FIREBASE_TEST_JWKS: jwks }).FIREBASE_TEST_JWKS).toBe(jwks);
    expect(() => parseEnvironment({ ...local, FIREBASE_TEST_JWKS: jwks })).toThrow('FIREBASE_TEST_JWKS');
    expect(() => parseEnvironment({ ...local, NODE_ENV: 'test', FIREBASE_TEST_JWKS: jwks })).toThrow('FIREBASE_TEST_JWKS');
  });
  it('rejects colliding listener ports', () => {
    expect(() => parseEnvironment({ ...local, WORKER_PORT: 3001 })).toThrow('WORKER_PORT');
  });
});
