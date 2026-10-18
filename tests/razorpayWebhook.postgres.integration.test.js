import test from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import { closeDatabase, ensureSchema, ensureWorkspaceOrganization, __setPoolForTests, queryDatabase } from '../server/db.js';
import { processRazorpayWebhook } from '../server/razorpaySubscriptions.js';

const TEST_DATABASE_URL = String(process.env.AGENCYOS_TEST_DATABASE_URL || '').trim();
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

test('PostgreSQL webhook processing ignores an older subscription event delivered late', { skip: !TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.RAZORPAY_WEBHOOK_SECRET = 'integration-webhook-secret';
  __setPoolForTests(null);
  const suffix = randomUUID();
  const email = `webhook-order-${suffix}@example.test`;
  const eventIds = [`evt-newer-${suffix}`, `evt-older-${suffix}`];
  let userId;
  let organizationId;
  const subscriptionId = `sub-${suffix}`;

  try {
    await ensureSchema();
    const user = await queryDatabase(
      'INSERT INTO workspace_users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      ['Webhook Order Test', email, 'test-only-not-a-real-password-hash'],
    );
    userId = user.rows[0].id;
    const organization = await ensureWorkspaceOrganization(userId, 'Webhook Order Test');
    organizationId = organization.id;
    await queryDatabase(
      `UPDATE organization_subscriptions
       SET razorpay_subscription_id = $2, status = 'created', last_provider_event_created = NULL
       WHERE organization_id = $1`,
      [organizationId, subscriptionId],
    );

    const sendEvent = async (eventId, type, created) => {
      const rawBody = Buffer.from(JSON.stringify({
        event: type,
        created,
        payload: {
          subscription: {
            entity: {
              id: subscriptionId,
              notes: { organization_id: organizationId },
              current_start: 1_780_000_000,
              current_end: 1_782_592_000,
            },
          },
        },
      }));
      const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
      return processRazorpayWebhook({ rawBody, signature, eventId });
    };

    await sendEvent(eventIds[0], 'subscription.activated', 1_780_000_000);
    await sendEvent(eventIds[1], 'subscription.created', 1_779_999_999);

    const saved = await queryDatabase(
      'SELECT status, last_provider_event_created FROM organization_subscriptions WHERE organization_id = $1',
      [organizationId],
    );
    assert.equal(saved.rows[0].status, 'active');
    assert.equal(Number(saved.rows[0].last_provider_event_created), 1_780_000_000);
  } finally {
    await queryDatabase('DELETE FROM payment_webhook_events WHERE event_id = ANY($1::text[])', [eventIds]).catch(() => {});
    if (organizationId) await queryDatabase('DELETE FROM organizations WHERE id = $1', [organizationId]).catch(() => {});
    if (userId) await queryDatabase('DELETE FROM workspace_users WHERE id = $1', [userId]).catch(() => {});
    await closeDatabase();
    __setPoolForTests(null);
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    if (ORIGINAL_WEBHOOK_SECRET === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
  }
});
