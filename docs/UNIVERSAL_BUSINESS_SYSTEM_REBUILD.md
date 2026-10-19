# AgencyOS: Universal Business Management System

## Product reset (October 2026)

AgencyOS is being repositioned from a lead-generation-first agency tool into a universal business workspace. The public REVOLTZ AI marketing site remains separate from the private workspace.

### Product rules

1. **No pretend functionality.** A module is visible only when its core actions work. Unavailable integrations must be clearly marked unavailable, not shown as working.
2. **₹0-first operation.** Core workflows must work without paid APIs. Any optional provider that can incur charges must be opt-in, disclose that before the request, and never run automatically.
3. **One source of truth.** Business records should link to customers, contacts, opportunities, tasks, projects, invoices, expenses, and activity. Avoid separate browser-only islands for related records.
4. **Persistence must be explicit.** The UI must show whether records are saved to the signed-in workspace, only to this browser, or not saved. No “saved” confirmation before a write succeeds.
5. **Import/export and recovery.** CSV import/export and a versioned workspace backup should remain available for owner-controlled portability.
6. **Public/private separation.** The public marketing site must never expose private customer data or the AgencyOS workspace.
7. **No OpenStreetMap/Overpass.** Do not reintroduce these providers.

## Phase 1 — dependable business core

Build and verify these modules before adding more integrations:

- **Home:** actionable overview of overdue tasks, open opportunities, projects, unpaid invoices, recent activity, and cash position. Every number links to its underlying records.
- **Business profile:** company details, currency, tax region, fiscal year, services/products, and preferences.
- **Contacts & customers:** people and organizations, notes, tags, consent/contact preferences, and linked history.
- **Sales pipeline:** opportunities, stage, value, next action, owner, source, and loss reason. Manual creation is first-class.
- **Tasks & calendar:** assigned tasks, due dates, priorities, recurrence where supported, and overdue views.
- **Projects & delivery:** project status, milestones, tasks, deadlines, deliverables, and customer linkage.
- **Invoices & payments:** invoice records, due dates, status, payment entries, and balance calculations. Clearly distinguish a tracker from legal tax invoice generation or payment processing.
- **Expenses & cash flow:** income/expense records, categories, dates, and transparent totals. Clearly distinguish a planning tool from accounting/tax advice.
- **Reports:** calculated from saved records only; empty data must show empty states, not sample totals.
- **Settings & data:** workspace identity, storage/sync status, export, backup/restore, and integration health.

## Phase 2 — optional capabilities

Only add after the core has tests and reliable persistence:

- Public web research links and manual prospect qualification.
- AI writing/analysis using a user-supplied key, with cost/quota warning and explicit click-to-run.
- Website audit with bounded checks and transparent limitations.
- Public audit intake and owner inbox, if deployment health and access control are verified.
- Notifications, only where delivery is configured and testable.

## Remove, disable, or quarantine until verified

- The current Google Maps scraper integration: repeated Render 502s, long-running jobs, and free-tier Chromium memory failures make it unreliable for a core workflow.
- Paid web-search / OpenRouter paths: not part of the ₹0 default and must not be presented as available in zero-cost mode.
- Any unverified AI or provider integration that can silently fail or incur usage charges.
- Duplicate modules that maintain disconnected copies of the same business data; consolidate them gradually rather than deleting user data.
- Any demo/fake records in production views. Demo mode must be explicit and visibly labeled.

## Technical acceptance gates

Every phase must pass:

- `npm test`
- `npm run build`
- `VITE_PUBLIC_SITE_ONLY=true npm run build -- --base=/Revoltz/`
- Tests for create, read, update, delete, validation, empty state, import/export, and persistence failure for each core entity.
- Account isolation tests for every server-backed workspace record.
- A clear storage status and error state when the server/database is unavailable.
- Manual smoke test against the actual Render deployment after a successful deployment. GitHub Pages build success is not evidence that the Express backend is healthy.

## Data model direction

Use stable IDs and explicit relationships rather than coupling records by display names:

- Workspace → business profile and members
- Organization/customer → contacts, opportunities, projects, invoices, activity
- Opportunity → tasks, proposals, expected value, stage history
- Project → milestones, tasks, deliverables
- Invoice → line items, payments, due date, status
- Expense/payment → category, date, amount, notes, optional project/customer
- Task/activity → entity reference, due date, owner, status

Do not perform a destructive database migration or delete existing user records as part of the UI redesign. First inventory legacy data, add a migration path, and preserve export/restore.

## Definition of done

A user can run a small business from one workspace without connecting an AI key or any paid provider: create a customer, record an opportunity, schedule tasks, deliver a project, record an invoice/payment and expenses, then see accurate dashboard totals and export their records. Optional integrations are enhancements—not prerequisites.