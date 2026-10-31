# AgencyOS Restructure: DineTap Sales & Customer Operations

## Product boundary
AgencyOS is Revoltz's internal system for acquiring and managing DineTap customers. DineTap remains a separate, untouched product. AgencyOS may store sales/account-management notes and milestone checklists only; it must not connect to DineTap APIs, database, hosting, menus, tables, orders, payments, or production configuration.

## Target customer lifecycle
1. **Prospect** — restaurant lead sourced from manual entry, CSV, or explicitly selected research provider.
2. **Qualified** — contact and location verified, decision-maker identified, fit and next action recorded.
3. **Contacted** — human-reviewed outreach draft sent manually; record contact date and outcome.
4. **Demo scheduled** — date, attendees, discovery notes, and demo outcome.
5. **Pilot/trial** — agreed scope, start/end dates, success criteria, and next review.
6. **Proposal/negotiation** — package, setup fee, recurring fee, terms, and decision date.
7. **Won / active customer** — only after explicit confirmation; record agreement/payment status and onboarding checklist.
8. **At risk / renewal / former customer** — support issues, feedback, renewal date, and close-out reason.

## Implementation phases
### Phase 0 — Safety baseline
- Map route/component ownership, shared localStorage keys, API routes, DB schema, tests, deployment triggers, and dependencies.
- Record which data is browser-only versus server-persisted.
- Add or verify export/restore and core smoke tests before any storage migration.
- Never delete or rewrite customer data during cleanup. Keep changes on a branch and reviewable PR.

### Phase 1 — Sales workflow
- Extend the deal pipeline with restaurant-focused stages.
- Capture next follow-up, contact/demo notes, pilot dates, lost reason, and expected one-time/recurring value.
- Add a due/overdue follow-up view and useful pipeline summaries.
- Outreach remains a draft; never send messages automatically.

### Phase 2 — Customer accounts
- Separate prospects from won/active customers without duplicating records.
- Track package, agreed price, setup/recurring billing, start/renewal dates, agreement/payment status, and primary contact.
- Make onboarding checklist service-aware: discovery, required menu/table data received, QR material prepared, staff training, pilot review, handover, and sign-off.
- These are operational tracking tasks only, not DineTap application changes.

### Phase 3 — Reliability and cleanup
- Validate localStorage schemas and malformed-data recovery.
- Verify backup/restore and export preserve existing records.
- Assess server-side persistence and concurrent-write behavior before relying on multi-device or team workflows.
- Remove a file/dependency only after repository-wide reference analysis and passing tests.
- Keep Google Maps scraping quarantined; provider-cost features remain opt-in.

## Release gates
- Existing records remain readable and exportable.
- `npm test` and `npm run build` pass.
- Core flows are checked in preview before any production rollout.
- No DineTap repository, database, service, deployment, or configuration is modified.
- No automatic outreach, payment collection, or paid provider calls are introduced by default.
