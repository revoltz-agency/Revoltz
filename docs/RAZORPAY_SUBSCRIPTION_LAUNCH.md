# Razorpay subscription launch runbook

**Current implementation state:** billing routes and signature helpers are in code; live credentials, plan, webhook delivery, Render deployment, and real payment lifecycle have not been verified. Do not advertise subscriptions as live until the checklist below is complete.

## Environment variables

Configure these only in the production host's secret/environment settings; never commit values:

- `RAZORPAY_KEY_ID`: test credentials first, live credentials only after acceptance tests.
- `RAZORPAY_KEY_SECRET`: server-only API secret.
- `RAZORPAY_PLAN_ID_STARTER`: monthly plan ID created in the Razorpay dashboard. Confirm the displayed amount, interval, currency, tax treatment and cancellation terms in the dashboard.
- `RAZORPAY_WEBHOOK_SECRET`: a long random secret set identically in the Razorpay webhook configuration.
- `AGENCYOS_BILLING_ENFORCED=false`: keep false until end-to-end tests pass. Setting true requires an active, verified subscription for workspace state and protected lead-research APIs.

The app shows a subscription entry point only when all four Razorpay settings are present. The customer is redirected to Razorpay's hosted checkout, where they must review the configured amount and approve payment.

## Webhook configuration

Configure a webhook pointing to `https://YOUR-AGENCYOS-HOST/api/billing/webhook`. Subscribe to the Razorpay subscription events used by the server:

- `subscription.authenticated`
- `subscription.activated`
- `subscription.charged`
- `subscription.pending`
- `subscription.halted`
- `subscription.paused`
- `subscription.resumed`
- `subscription.cancelled`
- `subscription.completed`
- `subscription.expired`

The server verifies the HMAC against the exact raw request body and records provider event IDs for idempotency. The webhook must be tested against the actual host before enabling access enforcement.

## Release checklist

1. Use Razorpay test credentials and a test monthly plan.
2. Create a fresh AgencyOS account and start checkout from the signed-in workspace.
3. Complete the test checkout and confirm the webhook reaches the deployed backend with a valid signature.
4. Confirm the subscription row becomes `active` and the account status endpoint reports it.
5. Test invalid signatures, duplicate event IDs, cancelled subscriptions, halted subscriptions, and failed database access.
6. Confirm a non-subscriber receives a subscription-required response only when enforcement is deliberately enabled; confirm an active subscriber can use the workspace.
7. Verify account A cannot use account B's subscription and that all billing rows are scoped to the authenticated account.
8. Verify Render's deployed commit, database schema, backups/restore, support contact, privacy notice and cancellation/refund terms.
9. Only then set `AGENCYOS_BILLING_ENFORCED=true` and use live credentials after an explicit production approval.

## Known limitations before taking money

- No live Razorpay or Render verification has been performed from this repository workflow.
- Subscription cancellation/self-service management and refund handling still need a customer-facing flow and operational policy.
- Password reset/email verification and production restore testing remain launch blockers for a broad public release.
- Never enable enforcement before a working checkout and webhook are verified; doing so can lock legitimate users out.
