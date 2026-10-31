# AgencyOS Restructure: Real Estate CRM & Operations

## Product direction
AgencyOS is being redeveloped as a focused CRM and operations workspace for real estate agencies, brokers, and property consultants in India. It is not a universal business-management system.

## Product boundary
- Work only in the `revoltz-agency/Revoltz` repository and AgencyOS.
- Do not modify, connect to, or deploy anything in DineTap or Revoltz Restaurant OS.
- Preserve existing user data. Do not silently repurpose or delete old records while changing the product.
- Use sample property data only when clearly labelled as fictional.
- No automatic messages, calls, bookings, payments, or paid-provider requests by default.

## Core workflows
1. **Lead inbox** — buyer, seller, landlord, tenant, investor, and referral enquiries; source, contact details, budget, preferred locations, property type, intent, urgency, assigned agent, consent/communication preferences, and next follow-up.
2. **Property inventory** — sale/rent, residential/commercial/land/plot, listing status, asking price or rent, location, beds/baths/area, furnishing, amenities, owner/mandate status, photos/documents, and listing verification date.
3. **Lead-to-property matching** — shortlist listings against a lead's budget, location, property type, and requirements; explain matches without inventing availability.
4. **Sales pipeline** — New enquiry → Contacted → Qualified → Requirement captured → Properties shared → Site visit scheduled → Site visit completed → Negotiation → Token/booking → Agreement/closed; Lost/on hold with reason. Support rental-specific stages without forcing sale-only steps.
5. **Site visits & follow-ups** — appointment date/time, property, client, assigned agent, visit outcome, notes, next action, and overdue reminders.
6. **Client and transaction workspace** — client requirements, linked properties, offer history, deal status, important dates, document checklist, and payment/commission tracking. Never present this as legal, tax, or payment verification.
7. **Team operations** — agent assignments, activity history, handover notes, and transparent performance summaries.
8. **Reports** — lead conversion, source effectiveness, listing ageing, visits-to-bookings, inventory status, pending follow-ups, closed value, and commission estimates.

## Delivery phases
### Phase 0 — Safety and discovery
- Map routes/components, shared storage keys, API routes, DB schema, tests, dependencies, and deployment triggers.
- Identify browser-only versus server-persisted data and test backup/restore before storage changes.
- Keep all work on a reviewable branch and PR; no production deployment without approval.

### Phase 1 — Real-estate product foundation
- Replace broad/general-agency positioning, sample searches, demo copy, and sales service choices with real-estate language.
- Define explicit lead, property, visit, and deal concepts while preserving existing records and exportability.
- Use clearly fictional property/lead records for previews; never present them as live inventory.

### Phase 2 — Daily-use CRM
- Build lead qualification, buyer/seller/rental requirements, assignments, follow-up queues, and sale/rental pipeline.
- Add property inventory and a safe, explainable lead-to-property shortlist.
- Link site visits to both a lead and a property; record outcomes and next actions.

### Phase 3 — Transactions and team reporting
- Add deal timeline, document checklist, booking/closing milestones, commission estimates, and reports.
- Verify access controls and persistence before promising multi-user collaboration.

### Phase 4 — Reliability and release
- Validate stored-data schemas and malformed-data recovery.
- Verify export/restore, migration safety, and core smoke tests.
- Assess server-side persistence and concurrent-write behavior before multi-device/team rollout.
- Remove files/dependencies only after repository-wide reference analysis and passing tests.

## Release gates
- Existing records remain readable/exportable; migrations are explicit and reversible.
- `npm test` and `npm run build` pass.
- Core flows are tested in preview before production rollout.
- No DineTap repository, database, service, deployment, or configuration is modified.
- No automatic outreach or paid provider calls are introduced by default.
