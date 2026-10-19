// Minimal Razorpay helpers. No secrets are exposed to the browser.
import crypto from 'node:crypto';

export function razorpayConfig(env = process.env) {
  const keyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  const planId = String(env.RAZORPAY_PLAN_ID_STARTER || '').trim();
  const webhookSecret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  return {
    configured: Boolean(keyId && keySecret && planId && webhookSecret),
    keyId, keySecret, planId, webhookSecret,
    enforcementEnabled: String(env.AGENCYOS_BILLING_ENFORCED || '').trim().toLowerCase() === 'true',
  };
}

export function verifyRazorpayWebhook(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !rawBody.length || typeof signature !== 'string' || !secret) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function normalizeRazorpaySubscriptionStatus(value) {
  const status = String(value || '').toLowerCase();
  const allowed = new Set(['created', 'authenticated', 'active', 'pending', 'halted', 'paused', 'cancelled', 'completed', 'expired']);
  return allowed.has(status) ? status : 'pending';
}

export function razorpayWebhookEventId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : '';
}
