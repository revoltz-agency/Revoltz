import crypto from 'node:crypto';
import { ensureSchema, getPool, queryDatabase } from './db.js';

const TERMINAL_STATUSES = new Set(['cancelled', 'completed', 'expired']);
const RAZORPAY_API = 'https://api.razorpay.com/v1';

export function verifyRazorpayWebhookSignature(rawBody, signature, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  if (!secret || !rawBody || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'hex'); } catch { return false; }
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function razorpayEventStatus(eventType) {
  return ({
    'subscription.created': 'created',
    'subscription.authenticated': 'authenticated',
    'subscription.activated': 'active',
    'subscription.charged': 'active',
    'subscription.pending': 'pending',
    'subscription.halted': 'halted',
    'subscription.paused': 'halted',
    'subscription.cancelled': 'cancelled',
    'subscription.completed': 'completed',
    'subscription.expired': 'expired',
    'invoice.payment_failed': 'past_due',
  })[eventType] || null;
}

function apiCredentials() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    throw Object.assign(new Error('Razorpay API credentials are not configured on the server yet.'), { statusCode: 503 });
  }
  return { keyId, keySecret };
}

function configuration() {
  const credentials = apiCredentials();
  const planId = String(process.env.RAZORPAY_PLAN_ID_STARTER || '').trim();
  if (!planId) {
    throw Object.assign(new Error('Razorpay billing plan is not configured on the server yet.'), { statusCode: 503 });
  }
  return { ...credentials, planId };
}

export async function createRazorpaySubscription(userId) {
  await ensureSchema();
  const { keyId, keySecret, planId } = configuration();
  const result = await queryDatabase(
    `SELECT o.id AS organization_id, m.role, s.status, s.razorpay_subscription_id
     FROM organization_memberships m
     JOIN organizations o ON o.id = m.organization_id
     JOIN organization_subscriptions s ON s.organization_id = o.id
     WHERE m.user_id = $1
     ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, m.created_at ASC
     LIMIT 1`,
    [userId],
  );
  const membership = result.rows[0];
  if (!membership) throw Object.assign(new Error('No organization is available for this workspace account.'), { statusCode: 403 });
  if (membership.role !== 'owner') throw Object.assign(new Error('Only the organization owner can start a subscription.'), { statusCode: 403 });
  if (membership.status === 'active') throw Object.assign(new Error('This organization already has an active subscription.'), { statusCode: 409 });
  if (membership.razorpay_subscription_id && !TERMINAL_STATUSES.has(membership.status)) {
    throw Object.assign(new Error('A subscription is already pending for this organization. Contact support before creating another.'), { statusCode: 409 });
  }

  const response = await fetch(`${RAZORPAY_API}/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: planId,
      customer_notify: 1,
      total_count: 120,
      quantity: 1,
      notes: { organization_id: membership.organization_id, product: 'AgencyOS' },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* Handle provider errors below. */ }
  if (!response.ok || !payload.id || !payload.short_url) {
    console.error('[razorpay] subscription creation failed:', response.status, payload?.error?.code || 'provider_error');
    throw Object.assign(new Error('Razorpay could not create the subscription. Please try again later.'), { statusCode: 502 });
  }
  const initialStatus = ['created', 'authenticated', 'active', 'pending', 'halted'].includes(payload.status)
    ? payload.status
    : 'created';
  await queryDatabase(
    `UPDATE organization_subscriptions
     SET razorpay_subscription_id = $2, razorpay_customer_id = $3, status = $4,
         current_period_start = NULL, current_period_end = NULL,
         cancel_at_period_end = false, updated_at = now()
     WHERE organization_id = $1`,
    [membership.organization_id, payload.id, payload.customer_id || null, initialStatus],
  );
  return { checkoutUrl: payload.short_url, subscriptionId: payload.id, status: initialStatus };
}

export async function cancelRazorpaySubscriptionAtPeriodEnd(userId) {
  await ensureSchema();
  const { keyId, keySecret } = apiCredentials();
  const result = await queryDatabase(
    `SELECT o.id AS organization_id, m.role, s.status, s.razorpay_subscription_id, s.cancel_at_period_end
     FROM organization_memberships m
     JOIN organizations o ON o.id = m.organization_id
     JOIN organization_subscriptions s ON s.organization_id = o.id
     WHERE m.user_id = $1
     ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, m.created_at ASC
     LIMIT 1`,
    [userId],
  );
  const membership = result.rows[0];
  if (!membership) throw Object.assign(new Error('No organization is available for this workspace account.'), { statusCode: 403 });
  if (membership.role !== 'owner') throw Object.assign(new Error('Only the organization owner can manage billing.'), { statusCode: 403 });
  if (membership.status !== 'active' || !membership.razorpay_subscription_id) {
    throw Object.assign(new Error('Only an active subscription can be scheduled for cancellation.'), { statusCode: 409 });
  }
  if (membership.cancel_at_period_end) {
    throw Object.assign(new Error('Cancellation is already scheduled for the end of the billing period.'), { statusCode: 409 });
  }

  const response = await fetch(`${RAZORPAY_API}/subscriptions/${encodeURIComponent(membership.razorpay_subscription_id)}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cancel_at_cycle_end: 1 }),
    signal: AbortSignal.timeout(12_000),
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* Handle provider errors below. */ }
  if (!response.ok) {
    console.error('[razorpay] subscription cancellation failed:', response.status, payload?.error?.code || 'provider_error');
    throw Object.assign(new Error('Razorpay could not schedule cancellation. Please try again later.'), { statusCode: 502 });
  }

  await queryDatabase(
    `UPDATE organization_subscriptions
     SET cancel_at_period_end = true, updated_at = now()
     WHERE organization_id = $1 AND razorpay_subscription_id = $2`,
    [membership.organization_id, membership.razorpay_subscription_id],
  );
  return { scheduled: true, cancelAtPeriodEnd: true };
}

export async function processRazorpayWebhook({ rawBody, signature, eventId }) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!secret) throw Object.assign(new Error('Razorpay webhook is not configured.'), { statusCode: 503 });
  if (!verifyRazorpayWebhookSignature(rawBody, signature, secret)) {
    throw Object.assign(new Error('Invalid Razorpay webhook signature.'), { statusCode: 401 });
  }
  if (typeof eventId !== 'string' || !eventId.trim() || eventId.length > 200) {
    throw Object.assign(new Error('Missing or invalid Razorpay event ID.'), { statusCode: 400 });
  }

  let event;
  try { event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)); }
  catch { throw Object.assign(new Error('Invalid Razorpay webhook payload.'), { statusCode: 400 }); }
  if (!event || typeof event.event !== 'string') {
    throw Object.assign(new Error('Invalid Razorpay webhook event.'), { statusCode: 400 });
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO payment_webhook_events (event_id, provider, event_type, payload)
       VALUES ($1, 'razorpay', $2, $3::jsonb)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId.trim(), event.event, JSON.stringify(event)],
    );
    if (!inserted.rowCount) {
      await client.query('COMMIT');
      return { received: true, duplicate: true };
    }

    const nextStatus = razorpayEventStatus(event.event);
    const subscription = event.payload?.subscription?.entity || null;
    const invoice = event.payload?.invoice?.entity || null;
    // An invoice's identifier is not a subscription identifier.
    const subscriptionId = subscription?.id || invoice?.subscription_id;
    const entity = subscription || {};
    const providerEventCreated = Number.isSafeInteger(event.created) && event.created > 0 ? event.created : null;
    if (nextStatus && subscriptionId) {
      await client.query(
        `UPDATE organization_subscriptions
         SET status = $2,
             razorpay_customer_id = COALESCE($3, razorpay_customer_id),
             current_period_start = CASE WHEN $4::double precision IS NULL THEN current_period_start ELSE to_timestamp($4::double precision) END,
             current_period_end = CASE WHEN $5::double precision IS NULL THEN current_period_end ELSE to_timestamp($5::double precision) END,
             last_provider_event_created = COALESCE($6::bigint, last_provider_event_created),
             updated_at = now()
         WHERE razorpay_subscription_id = $1
           AND (
             ($6::bigint IS NOT NULL AND (last_provider_event_created IS NULL OR last_provider_event_created <= $6::bigint))
             OR ($6::bigint IS NULL AND last_provider_event_created IS NULL)
           )`,
        [subscriptionId, nextStatus, entity.customer_id || invoice?.customer_id || null, entity.current_start ?? null, entity.current_end ?? null, providerEventCreated],
      );
    }
    await client.query('UPDATE payment_webhook_events SET processed_at = now() WHERE event_id = $1', [eventId.trim()]);
    await client.query('COMMIT');
    return { received: true, duplicate: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
