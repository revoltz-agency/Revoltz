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
      if (/^\s*(CREATE TABLE|CREATE INDEX) IF NOT EXISTS/i.test(text) || /^\s*ALTER TABLE organization_subscriptions/i.test(text)) return { rows: [], rowCount: 0 };
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


test('webhook subscription updates carry provider event time to prevent stale state overwrites', async () => {
  const oldDatabaseUrl = process.env.DATABASE_URL;
  const oldWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.DATABASE_URL = 'postgres://example.invalid/agencyos-webhook-test';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-order-test-secret';
  const queries = [];
  const client = {
    async query(text, values = []) {
      queries.push({ text, values });
      if (/^\s*INSERT INTO payment_webhook_events/i.test(text)) return { rows: [{ event_id: 'evt_newer' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = {
    on() {},
    async end() {},
    async query(text, values = []) {
      if (/^\s*(CREATE TABLE|CREATE INDEX) IF NOT EXISTS/i.test(text) ||
          /^\s*ALTER TABLE organization_subscriptions/i.test(text)) return { rows: [], rowCount: 0 };
      if (/^\s*INSERT INTO /i.test(text) && /\bSELECT\b/i.test(text)) return { rows: [], rowCount: 0 };
      throw new Error(`Unexpected webhook schema SQL: ${text}`);
    },
    async connect() { return client; },
  };
  __setPoolForTests(pool);
  const event = {
    event: 'subscription.activated',
    created: 1_780_000_000,
    payload: { subscription: { entity: {
      id: 'sub_order_test',
      customer_id: 'cus_order_test',
      notes: { organization_id: '3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f' },
      current_start: 1_780_000_000,
      current_end: 1_782_592_000,
    } } },
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  try {
    const result = await processRazorpayWebhook({ rawBody, signature, eventId: 'evt_newer' });
    assert.deepEqual(result, { received: true, duplicate: false });
    const update = queries.find((query) => query.text.includes('UPDATE organization_subscriptions'));
    assert.ok(update, 'the subscription row is updated');
    assert.match(update.text, /last_provider_event_created\s*=\s*COALESCE\(\$6::bigint, last_provider_event_created\)/);
    assert.match(update.text, /last_provider_event_created IS NULL OR last_provider_event_created <= \$6::bigint/);
    assert.equal(update.values[0], 'sub_order_test');
    assert.equal(update.values[1], 'active');
    assert.equal(update.values[5], 1_780_000_000);
    assert.equal(update.values[6], '3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f');
    assert.match(update.text, /organization_id = \$7::uuid/);
    assert.ok(queries.some((query) => query.text === 'COMMIT'));
  } finally {
    __setPoolForTests(null);
    if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabaseUrl;
    if (oldWebhookSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = oldWebhookSecret;
  }
});
