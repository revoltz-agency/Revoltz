# AgencyOS subscription plans

Status: proposed commercial structure. These tiers are not active offers and must not be represented as purchasable until Razorpay plan IDs, checkout, webhook handling, entitlement gates, cancellation, expiry, and production smoke tests have passed.

## Free

- ₹0; no payment method required.
- Manual lead creation and CSV import.
- Free public research links and CRM pipeline.
- No paid-provider calls unless the account owner explicitly configures and selects an optional integration.
- Standard workspace and essential business tools, subject to documented product limits.

## Starter

- Monthly subscription; price intentionally unset until pricing is validated.
- Core CRM and lead pipeline.
- Proposal and follow-up workflows.
- Individual/single-workspace use.
- No promise of verified lead discovery from free public research.

## Pro

- Monthly subscription; price intentionally unset until pricing is validated.
- Expanded workflow and reporting access.
- Organization-level collaboration only after team permissions and tenant isolation have been verified.
- Usage limits and included integrations must be documented before the plan is sold.

## Razorpay server configuration

- Starter checkout requires `RAZORPAY_PLAN_ID_STARTER`.
- Pro checkout requires `RAZORPAY_PLAN_ID_PRO`.
- Both plan IDs must be created and reviewed in the Razorpay dashboard before the corresponding tier is offered.
- Keep `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` only in the server hosting environment. Never put them in frontend variables, browser storage, or Git.
- If the selected plan ID is missing, checkout should fail closed with a configuration error; it must not silently switch to another tier.
- The UI currently offers Starter and Pro checkout choices; Free remains a no-payment tier and is not a Razorpay checkout option. Published prices are still unset.

## Billing implementation rules

1. The server owns plan definitions, prices, Razorpay plan IDs, and entitlements. Never trust a browser-submitted price or plan ID.
2. Checkout must be created for the authenticated organization owner and the selected server-defined plan.
3. Access to paid features is granted only after a valid, verified provider state/webhook. A checkout redirect alone is not proof of payment.
4. Webhook signatures must be verified against the exact raw request bytes. Event deduplication and subscription updates must be atomic.
5. Older provider events must not overwrite newer subscription state. Missing or equal-second timestamps need a deterministic, tested policy.
6. Cancellation, failed payment, expiry, duplicate delivery, invalid signatures, retry/recovery, and organization isolation must be tested.
7. Keep billing enforcement disabled until all tests and live smoke checks pass. Never enable paid provider calls silently.
8. Do not publish or charge these plans until actual pricing, plan IDs, refund/cancellation terms, support contact, privacy/retention, and applicable tax requirements are reviewed.

## Release acceptance

- Scraper integration is retired from the supported product and config output.
- Lead discovery remains honest and ₹0-first: public research links, manual entry, and CSV import are available without scraping.
- npm test, npm run check:launch, npm run smoke:deployment, and production builds pass.
- Two test organizations cannot read or mutate each other's workspace or billing data.
- Razorpay test-mode checkout, signed webhook, duplicate replay, stale/out-of-order event, cancellation, failed payment, expiry, and recovery scenarios pass.
- Production deployment is smoke-tested with secrets configured only in the hosting dashboard.
