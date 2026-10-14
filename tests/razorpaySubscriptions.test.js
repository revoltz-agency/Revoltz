import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { cancelRazorpaySubscriptionAtPeriodEnd, processRazorpayWebhook, razorpayEventStatus, verifyRazorpayWebhookSignature } from '../server/razorpaySubscriptions.js';
import { __setPoolForTests } from '../server/db.js';

test('Razorpay webhook signatures are checked against the exact raw body', () => {
  const secret = 'test-webhook-secret-only';
  const rawBody = Buffer.from('{ "event": "subscription.activated", "payload": {} }');
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  assert.equal(verifyRazorpayWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(Buffer.from(rawBody.toString() + ' '), signature, secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, 'not-a-signature', secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, signature, ''), false);
});

test('Razorpay subscription events map only to supported internal statuses', () => {
  assert.equal(razorpayEventStatus('subscription.created'), 'created');
  assert.equal(razorpayEventStatus('subscription.authenticated'), 'authenticated');
  assert.equal(razorpayEventStatus('subscription.activated'), 'active');
  assert.equal(razorpayEventStatus('subscription.charged'), 'active');
  assert.equal(razorpayEventStatus('subscription.halted'), 'halted');
  assert.equal(razorpayEventStatus('subscription.cancelled'), 'cancelled');
  assert.equal(razorpayEventStatus('subscription.completed'), 'completed');
  assert.equal(razorpayEventStatus('subscription.expired'), 'expired');
  assert.equal(razorpayEventStatus('invoice.payment_failed'), 'past_due');
  assert.equal(razorpayEventStatus('some.unrelated_event'), null);
});

test('subscription cancellation is owner-only, scheduled at period end, and persisted', async () => {
  const oldEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_PLAN_ID_STARTER: process.env.RAZORPAY_PLAN_ID_STARTER,
  };
  const oldFetch = globalThis.fetch;
  const calls = [];
  process.env.DATABASE_URL = 'postgres://example.invalid/agencyos-test';
  process.env.RAZORPAY_KEY_ID = 'test_key_id';
  process.env.RAZORPAY_KEY_SECRET = 'test_key_secret';
  delete process.env.RAZORPAY_PLAN_ID_STARTER;
  const pool = {
    on() {},
    async end() {},
    async query(text, values = []) {
      calls.push({ text, values });
      if (/^\s*(CREATE TABLE|CREATE INDEX) IF NOT EXISTS/i.test(text) || /^\s*ALTER TABLE organization_subscriptions\s+ADD COLUMN IF NOT EXISTS last_provider_event_created/i.test(text)) return { rows: [], rowCount: 0 };
      if (text.includes('INSERT INTO organizations (name, owner_user_id)') || text.includes('INSERT INTO organization_memberships (organization_id, user_id, role)') || text.includes('INSERT INTO organization_subscriptions (organization_id, plan_key, status)') || text.includes('INSERT INTO organization_modules (organization_id, module_key, enabled)') || text.includes('INSERT INTO organization_workspace_data (organization_id, state, updated_at)')) return { rows: [], rowCount: 0 };
      if (/^\s*INSERT INTO /i.test(text) && /\bSELECT\b/i.test(text)) return { rows: [], rowCount: 0 };
      if (text.includes('FROM organization_memberships m') && text.includes('JOIN organization_subscriptions s')) {
        return { rows: [{
          organization_id: 'org-test',
          role: 'owner',
          status: 'active',
          razorpay_subscription_id: 'sub_test123',
          cancel_at_period_end: false,
        }], rowCount: 1 };
      }
      if (text.includes('UPDATE organization_subscriptions') && text.includes('cancel_at_period_end = true')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected billing SQL: ${text}`);
    },
  };
  __setPoolForTests(pool);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.razorpay.com/v1/subscriptions/sub_test123/cancel');
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).cancel_at_cycle_end, 1);
    return { ok: true, async json() { return { id: 'sub_test123', status: 'active' }; } };
  };
  try {
    const result = await cancelRazorpaySubscriptionAtPeriodEnd('user-test');
    assert.deepEqual(result, { scheduled: true, cancelAtPeriodEnd: true });
    assert.ok(calls.some((call) => call.text.includes('cancel_at_period_end = true') && call.values[0] === 'org-test'));
  } finally {
    __setPoolForTests(null);
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
