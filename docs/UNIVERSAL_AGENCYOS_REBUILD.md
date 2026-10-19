# AgencyOS universal business system rebuild

## Product direction

AgencyOS is a universal business management workspace, not a collection of loosely connected AI demos. It should help a business run its daily work from one place and remain useful without paid AI, lead APIs, or third-party subscriptions.

## Non-negotiable rules

- ₹0 operating mode is the default. Never call a paid provider unless the user explicitly selects it and sees the cost/limit warning.
- Never invent leads, contacts, activity, revenue, integrations, or success states.
- Clearly distinguish real saved records, user-entered data, sample/demo data, and unavailable integrations.
- Prefer durable workspace/database persistence over browser-only storage. Where persistence is browser-only, disclose it.
- Preserve existing user data and working public audit intake. No database reset or destructive migration as part of UI cleanup.
- Do not ship a button or module that appears operational if its action is a placeholder. Either implement and test it, or hide/disable it with an honest explanation.
- Keep the public Revoltz marketing website separate from the AgencyOS workspace.

## Core product navigation

1. **Overview** — business snapshot, due actions, key operational numbers.
2. **Customers & relationships** — customer/lead records, pipeline, follow-ups, onboarding, retention, activity history.
3. **Operations & delivery** — projects, delivery checklists, incoming audit requests.
4. **Finance** — invoices, expenses, cash flow, revenue goals, reports.
5. **Growth tools** — optional prospect research, campaigns, sales support, proposals.
6. **Optional AI & build tools** — AI auditor and demo builder, only when their capabilities and limitations are clearly stated.
7. **Workspace tools** — notes, backup, business profile, settings and integrations.

## Rebuild gates

### Gate 1 — Stabilize and simplify
- Keep the blank-page fix and build/test gates.
- Put the daily dashboard first and group navigation by universal business workflows.
- Keep optional AI and lead discovery away from the primary operating path.
- Do not delete existing records or remove the public audit intake flow.

### Gate 2 — Feature-by-feature verification
For each visible module, test: load/render, create, edit, delete/archive, refresh persistence, empty/error state, mobile layout, and whether its claims match its actual storage/API behavior. Classify each as **Working**, **Limited**, or **Unavailable**. Hide or disable unavailable features until fixed.

### Gate 3 — Shared data model
Use consistent records and IDs across customers, tasks, projects, invoices, expenses, notes, and activity. Add organization/workspace scoping and authorization before exposing multi-user customer data. Migrate without deleting old data.

### Gate 4 — Reliable daily workflow
Deliver the fundamentals first: dashboard → customer → task/follow-up → project → invoice/expense → reports. All primary actions must persist, show errors honestly, and be testable without AI integrations.

### Gate 5 — Optional integrations
Add integrations only behind explicit configuration and status checks. Free public search links are discovery aids, not automatically verified leads. AI and Maps API access can have quotas or costs; never represent them as guaranteed free.

## Current implementation note

The navigation was regrouped around universal business workflows and the default landing page was changed to the Growth Dashboard. This is a first safe redesign step, not a claim that every module has been audited or rebuilt. The full feature audit and reliability work remain necessary before calling the system production-ready.
