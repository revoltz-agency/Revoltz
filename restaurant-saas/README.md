# Revoltz Restaurant OS

A staged restaurant-management SaaS for India first, then international markets. This directory is isolated from the existing AgencyOS product and marketing site.

## Repository and deployment safety

- Existing repository: https://github.com/revoltz-agency/Revoltz
- Existing public marketing site: `/`
- Existing AgencyOS workspace: `/agencyos`
- Existing production service: `https://revoltz-agencyos.onrender.com` — do not modify or redeploy it for this project.
- Existing isolated SaaS preview service: `https://revoltz-1.onrender.com` — do not repurpose its database or deployment for restaurant data.
- Development branch: `product/restaurant-saas-foundation`
- This initial commit is documentation only. No application routes, database schema, environment variables, deployments, billing settings, or production services have been changed.

## Product goal

Build an affordable, dependable restaurant operations product—not just a POS screen—with:
1. Fast billing and order entry.
2. Tables, dine-in, takeaway and delivery.
3. Kitchen Order Tickets (KOT) and a kitchen display.
4. Menu, modifiers, taxes, discounts and receipts.
5. Inventory, recipes, purchasing, suppliers and wastage.
6. Reports, staff roles and outlet management.
7. QR ordering, customer CRM and loyalty.
8. AI-supported sales, menu-margin and waste insights.
9. Secure multi-tenant cloud sync, backups and subscription billing.
10. Offline-first operation and reliable recovery for core POS flows.

## Open-source starting point to evaluate

Primary candidate: **FloCafe** (https://github.com/FreeOpenSourcePOS/FloCafe), an MIT-licensed, offline-first desktop POS. Its published architecture uses Electron, Express, SQLite and a Next.js/React interface, with kitchen display and thermal printing support. The MIT license is permissive, but retain notices and verify the exact upstream version/license before copying code.

Why start here:
- Reuse proven local POS, order, kitchen and printing workflows instead of rebuilding all of them.
- Preserve offline operation as a first-class requirement.
- Add a separately designed cloud SaaS/control plane for restaurant accounts, multi-outlet sync, subscription entitlements and AI insights.

This is a candidate, not yet a confirmed production dependency. Before importing upstream code, inspect its current license, install/build/test commands, migration model, security boundaries, release activity and hardware support. Do not copy any proprietary Petpooja code, branding, text or visual assets.

## Proposed architecture

### Layer A — Local restaurant runtime
- Offline-first POS and kitchen workflow on the restaurant's device/network.
- Local durable database and queued sync events.
- Idempotent order/payment events and visible sync state.
- Local backup/export and recovery workflow.
- Printer support must be tested against real target hardware; browser print alone is not considered validated thermal printing.

### Layer B — SaaS control plane
- Tenant = restaurant business; outlet = individual location.
- Server-enforced tenant and outlet authorization on every protected query and mutation.
- Separate memberships and roles (owner, manager, cashier, waiter, kitchen, inventory).
- Cloud sync with idempotency, conflict handling, audit events and deletion/export workflows.
- Subscription entitlements checked server-side; payment webhooks verified and idempotent.
- No tenant can access another tenant's orders, customers, inventory, reports, files or settings.

### Layer C — Optional services
- QR menu/order links and customer-facing pages.
- AI summaries only from authorised restaurant data; no paid AI provider required for core billing.
- Payment gateway integrations remain optional and must disclose provider fees.
- Aggregator integrations (for example, Swiggy/Zomato) require official access and must not be promised until verified.

## India-first requirements

- Configurable INR pricing and Indian number/date formats.
- GST/tax configuration with explicit rounding and item/service categories; validate rules with a qualified accountant before commercial claims.
- GSTIN fields where relevant, invoice numbering, credit notes/refunds and exportable records.
- UPI/cash/card tender tracking; do not store sensitive payment credentials.
- Data export, backup, privacy notice, retention controls and role-based access.
- Localization-ready strings and tax packs so later countries can use different currencies and tax rules.
- Do not describe the product as legally or GST certified without independent verification.

## Delivery stages and acceptance criteria

### Stage 0 — Safe foundation (current)
- Dedicated feature branch.
- Record the upstream candidate and license.
- Keep all existing production routes/services and databases untouched.

### Stage 1 — Single-outlet pilot
- Menu/category/modifier setup.
- Dine-in/table and takeaway order creation.
- KOT and kitchen status flow.
- Bill calculation with configurable tax, discount and rounding.
- Cash/UPI/card tender recording (recording only; no card data storage).
- Receipt preview/print, order cancellation/refund audit trail.
- Daily sales and payment summary.
- Local persistence, backup/export and recovery tests.

Acceptance: order totals are reproducible; cancelled/voided orders are auditable; refresh/restart does not lose saved orders; tests cover tax/rounding, duplicate actions and permissions.

### Stage 2 — Operations
- Recipe-linked ingredient deductions, stock movements, purchase orders, suppliers, wastage and low-stock alerts.
- Staff accounts/roles and outlet permissions.
- Customer history and QR menu.
- Reconciliation and inventory valuation reports.

### Stage 3 — Secure multi-tenant SaaS
- Separate tenant/outlet membership model.
- Server-enforced isolation tests using at least two accounts and direct API requests.
- Sync queue, conflict strategy, audit logs, encrypted transport, backup/restore drills.
- Subscription plans and feature gates only after webhook and entitlement tests pass.

### Stage 4 — AI and integrations
- Explainable sales and menu-margin insights, with source numbers visible.
- Optional provider integrations with clear costs and opt-in.
- Official aggregator/payment integrations only after partner access and terms are verified.
- International tax/currency packs and localization.

## Zero-upfront-cost constraints

- Use permissively licensed open-source code and free-tier services where available.
- Core POS must not require a paid AI API.
- Do not promise unlimited free cloud hosting, guaranteed uptime or free transaction processing.
- Design the local runtime so a pilot can operate without paid cloud hosting; cloud sync and managed SaaS availability depend on provider free-tier limits.
- Keep secrets out of source control and never commit real customer data.

## Immediate next engineering tasks

1. Review FloCafe upstream code and current MIT license before adopting it.
2. Run its documented install, build and test workflow in an isolated environment.
3. Create a small technical spike for India tax/rounding, local order persistence, KOT and printer abstraction.
4. Define sync/event contracts before adding multi-tenant cloud sync.
5. Add automated tests before exposing the pilot to real restaurant transactions.
