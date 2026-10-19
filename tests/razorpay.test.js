import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizeRazorpaySubscriptionStatus, razorpayConfig, razorpayWebhookEventId, verifyRazorpayWebhook } from '../server/razorpay.js';

test('Razorpay configuration requires every server-side secret and the plan ID', () => {
  assert.equal(razorpayConfig({}).configured, false);
  assert.equal(razorpayConfig({
    RAZORPAY_KEY_ID: 'rzp_test_id',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAY_PLAN_ID_STARTER: 'plan_test',
  }).configured, false);
  const config = razorpayConfig({
    RAZORPAY_KEY_ID: 'rzp_test_id',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAY_PLAN_ID_STARTER: 'plan_test',
    RAZORPAY_WEBHOOK_SECRET: 'webhook_secret',
    AGENCYOS_BILLING_ENFORCED: 'true',
  });
  assert.equal(config.configured, true);
  assert.equal(config.enforcementEnabled, true);
  assert.equal(config.keySecret, 'secret');
});

test('Razorpay webhook verification requires exact raw bytes and a timing-safe HMAC match', () => {
  const body = Buffer.from(JSON.stringify({ event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_test' } } } }));
  const secret = 'webhook_secret';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyRazorpayWebhook(body, signature, secret), true);
  assert.equal(verifyRazorpayWebhook(body, signature, 'wrong_secret'), false);
  assert.equal(verifyRazorpayWebhook(Buffer.from(body.toString() + ' '), signature, secret), false);
  assert.equal(verifyRazorpayWebhook(body, 'invalid', secret), false);
  assert.equal(verifyRazorpayWebhook(body.toString(), signature, secret), false);
});

test('unknown subscription statuses fail to pending and event IDs are bounded', () => {
  assert.equal(normalizeRazorpaySubscriptionStatus('active'), 'active');
  assert.equal(normalizeRazorpaySubscriptionStatus('ACTIVE'), 'active');
  assert.equal(normalizeRazorpaySubscriptionStatus('surprise'), 'pending');
  assert.equal(razorpayWebhookEventId('evt_123'), 'evt_123');
  assert.equal(razorpayWebhookEventId(''), '');
  assert.equal(razorpayWebhookEventId('x'.repeat(201)), '');
});
