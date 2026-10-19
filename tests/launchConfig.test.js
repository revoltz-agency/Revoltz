import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLaunchConfiguration } from '../scripts/check-launch-config.mjs';

const validEnvironment = {
  DATABASE_URL: 'postgresql://app:secret@db.example.test/agencyos',
  RAZORPAY_KEY_ID: 'rzp_live_example',
  RAZORPAY_KEY_SECRET: 'not-a-real-secret',
  RAZORPAY_PLAN_ID_STARTER: 'plan_example',
  RAZORPAY_WEBHOOK_SECRET: 'webhook-example-secret',
  GOOGLE_MAPS_API_KEY: 'google-example-key',
  AUDIT_OWNER_PASSWORD_HASH: 'scrypt$abc123$def456',
  AUDIT_ALLOWED_ORIGINS: 'https://example.com,https://app.example.com',
  AGENCYOS_BILLING_ENFORCED: 'true',
  AUDIT_PUBLIC_INTAKE_ENABLED: 'true',
  TRUST_PROXY_HOPS: '1',
};

test('paid launch preflight passes when all required configuration is valid', () => {
  const result = validateLaunchConfiguration(validEnvironment);
  assert.equal(result.ready, true);
  assert.ok(result.checks.every((check) => check.ok));
});

test('paid launch preflight blocks missing required billing configuration but not optional Google Places', () => {
  const result = validateLaunchConfiguration({
    ...validEnvironment,
    RAZORPAY_PLAN_ID_STARTER: '',
    RAZORPAY_WEBHOOK_SECRET: '',
    AGENCYOS_BILLING_ENFORCED: 'false',
    GOOGLE_MAPS_API_KEY: '',
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.checks.filter((check) => !check.ok).map((check) => check.key), [
    'RAZORPAY_PLAN_ID_STARTER',
    'RAZORPAY_WEBHOOK_SECRET',
    'AGENCYOS_BILLING_ENFORCED',
  ]);
  const googlePlaces = result.checks.find((check) => check.key === 'GOOGLE_MAPS_API_KEY');
  assert.equal(googlePlaces.ok, true);
  assert.equal(googlePlaces.configured, false);
});

test('paid launch preflight rejects malformed database URLs and origin allowlists', () => {
  const result = validateLaunchConfiguration({
    ...validEnvironment,
    DATABASE_URL: 'file:///tmp/agencyos.db',
    AUDIT_ALLOWED_ORIGINS: 'https://example.com,http://insecure.example',
    TRUST_PROXY_HOPS: '0',
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.checks.filter((check) => !check.ok).map((check) => check.key), [
    'DATABASE_URL',
    'AUDIT_ALLOWED_ORIGINS',
    'TRUST_PROXY_HOPS',
  ]);
});
