import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { razorpayEventStatus, verifyRazorpayWebhookSignature } from '../server/razorpaySubscriptions.js';

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
