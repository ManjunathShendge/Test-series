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
    expect(
      parseEnvironment({
        ...staging,
        DATABASE_CA_CERT_PATH: 'ca.pem',
        STORAGE_ENDPOINT: 'objects.example.test',
        STORAGE_ACCESS_KEY: 'key',
        STORAGE_SECRET_KEY: 'secret',
        STORAGE_PUBLIC_ENDPOINT: 'uploads.example.test',
        EXAMINER_AGREEMENT_VERSION: 'owner-approved-v1',
        EXAMINER_AGREEMENT_TEXT: 'Owner-approved agreement text',
        ANTIVIRUS_HOST: 'scanner.example.test',
        ANTIVIRUS_PORT: 3310,
      }).APP_ENV,
    ).toBe('staging');
  });
  it('requires a malware scanner in deployed environments', () => {
    const staging = {
      ...local,
      APP_ENV: 'staging',
      FIREBASE_PROJECT_ID: 'exam-prep-staging',
      FIREBASE_AUTH_EMULATOR_HOST: undefined,
      CORS_ORIGINS: 'https://staging.example.test',
      PUBLIC_WEB_ORIGIN: 'https://staging.example.test',
      DATABASE_CA_CERT_PATH: 'ca.pem',
      STORAGE_ENDPOINT: 'objects.example.test',
      STORAGE_ACCESS_KEY: 'key',
      STORAGE_SECRET_KEY: 'secret',
      STORAGE_PUBLIC_ENDPOINT: 'uploads.example.test',
      EXAMINER_AGREEMENT_VERSION: 'owner-approved-v1',
      EXAMINER_AGREEMENT_TEXT: 'Owner-approved agreement text',
    };
    expect(() => parseEnvironment(staging)).toThrow('ANTIVIRUS_HOST');
  });
  it('rejects invalid malware scanner ports', () => {
    expect(() => parseEnvironment({ ...local, ANTIVIRUS_HOST: 'localhost', ANTIVIRUS_PORT: 0 }))
      .toThrow('ANTIVIRUS_PORT');
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
    expect(() => parseEnvironment({ ...local, FIREBASE_PROJECT_ID: undefined })).toThrow(
      'FIREBASE_PROJECT_ID',
    );
    expect(() => parseEnvironment({ ...local, FIREBASE_PROJECT_ID: 'Bad Project!' })).toThrow(
      'FIREBASE_PROJECT_ID',
    );
  });
  it('accepts test signing keys only when NODE_ENV and APP_ENV are both test', () => {
    const jwks = '{"keys":[]}';
    expect(
      parseEnvironment({ ...local, NODE_ENV: 'test', APP_ENV: 'test', FIREBASE_TEST_JWKS: jwks })
        .FIREBASE_TEST_JWKS,
    ).toBe(jwks);
    expect(() => parseEnvironment({ ...local, FIREBASE_TEST_JWKS: jwks })).toThrow(
      'FIREBASE_TEST_JWKS',
    );
    expect(() =>
      parseEnvironment({ ...local, NODE_ENV: 'test', FIREBASE_TEST_JWKS: jwks }),
    ).toThrow('FIREBASE_TEST_JWKS');
  });
  it('rejects colliding listener ports', () => {
    expect(() => parseEnvironment({ ...local, WORKER_PORT: 3001 })).toThrow('WORKER_PORT');
  });
  it('checks provider key shapes and pairs without echoing values', () => {
    expect(() => parseEnvironment({ ...local, LLM_API_KEY: 'not-a-real-key-000000000000' })).toThrow('LLM_API_KEY');
    expect(parseEnvironment({ ...local, LLM_API_KEY: `sk-ant-${'a'.repeat(30)}` }).LLM_API_KEY).toBeDefined();
    expect(() => parseEnvironment({ ...local, POSTHOG_API_KEY: 'phx_personal0000000000' })).toThrow('POSTHOG_API_KEY');
    expect(() => parseEnvironment({ ...local, EMAIL_SMTP_URL: 'smtp://u:p@mail.test:587' })).toThrow('EMAIL_FROM');
    try {
      parseEnvironment({ ...local, LLM_API_KEY: 'secret-value-must-not-leak-123' });
    } catch (error) {
      expect(String(error)).not.toContain('secret-value');
    }
  });
  it('checks the Firebase service account belongs to this project', () => {
    const account = (project_id: string) =>
      JSON.stringify({ project_id, client_email: 'svc@x.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----' + 'x' + '-----END PRIVATE KEY-----' });
    expect(parseEnvironment({ ...local, FIREBASE_SERVICE_ACCOUNT_JSON: account('demo-exam-prep') }).FIREBASE_SERVICE_ACCOUNT_JSON).toBeDefined();
    expect(() => parseEnvironment({ ...local, FIREBASE_SERVICE_ACCOUNT_JSON: account('other-project') })).toThrow('different Firebase project');
    expect(() => parseEnvironment({ ...local, FIREBASE_SERVICE_ACCOUNT_JSON: '{"broken": true}' })).toThrow('FIREBASE_SERVICE_ACCOUNT_JSON');
  });
  it('refuses Razorpay test keys in production', () => {
    const prod = { ...local, APP_ENV: 'production', NODE_ENV: 'production', FIREBASE_AUTH_EMULATOR_HOST: undefined };
    expect(() => parseEnvironment({ ...prod, RAZORPAY_KEY_ID: 'rzp_test_abc123', RAZORPAY_KEY_SECRET: 'secret123' })).toThrow('live Razorpay');
  });
});
