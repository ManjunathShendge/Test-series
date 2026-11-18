import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/env.js';

const local = {
  APP_ENV: 'local',
  PUBLIC_WEB_ORIGIN: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  DATABASE_URL: 'file:./data/test.sqlite',
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
  it('does not expose secrets in validation errors', () => {
    expect(() => parseEnvironment({ ...local, DATABASE_URL: 'private-token' })).not.toThrow(
      'private-token',
    );
    expect(() => parseEnvironment({ ...local, DATABASE_URL: 'private-token' })).toThrow(
      'DATABASE_URL',
    );
  });
  it('rejects colliding listener ports', () => {
    expect(() => parseEnvironment({ ...local, WORKER_PORT: 3001 })).toThrow('WORKER_PORT');
  });
});
