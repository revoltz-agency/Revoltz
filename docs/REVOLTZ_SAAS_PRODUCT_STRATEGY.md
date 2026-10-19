# Revoltz SaaS product strategy

**Status:** Product direction for the next build phase  
**Budget constraint:** ₹0 fixed spend until customer revenue exists  
**Product principle:** Build a useful, secure business product first; add AI only where it creates measurable value.

## 1. Product decision

Build **Revoltz GrowthOS**: a lead-to-cash workspace for small service businesses. It helps owners turn enquiries into customers, remember every follow-up, deliver work on time, invoice clients, and see what money is due.

The long-term vision can be a universal business operating system. The first sellable version must not attempt to replace every CRM, accounting suite, project manager, and marketing platform at once.

### Initial ideal customers

Start with service businesses that win work through conversations and referrals:
- small digital/creative/AI agencies and freelancers;
- consultants and professional service providers;
- web development, marketing, and IT service shops.

Expand after real usage into other service categories (for example, clinics, salons, and repair businesses) with industry-specific templates rather than separate disconnected products.

### Core promise

**“Never lose track of an enquiry, a client commitment, or a payment again.”**

Do not promise automatic revenue growth, guaranteed leads, or fully autonomous AI.

## 2. The product loop

The first product should make one complete workflow reliable:

1. **Capture** — add an enquiry manually, from the public audit form, or through a documented import.
2. **Qualify** — record need, budget, source, fit, owner, and next action.
3. **Follow up** — set a date, show overdue items, and prepare a human-approved WhatsApp/email message. Do not send messages automatically without opt-in and configured integrations.
4. **Win** — move a qualified opportunity through a simple pipeline and create a customer/project.
5. **Deliver** — assign tasks, milestones, due dates, and status.
6. **Collect** — create an invoice/record, track due/paid status, and show overdue balances. Until a verified accounting integration exists, label these as tracking records, not tax-compliant invoices.
7. **Learn** — report on enquiry response, conversion, active work, overdue follow-ups, and outstanding payments using real saved records only.

## 3. MVP scope: keep, improve, defer

### Must work before public paid launch
- Secure account creation/sign-in, password reset, logout, and session protection.
- Isolated organization/workspace data; authorization tested on every read/write endpoint.
- Lead/customer records with search, filters, duplicate checks, and activity history.
- Pipeline and next-action reminders.
- Tasks/projects with due dates and clear ownership.
- Invoice/payment tracking with accurate totals and export.
- A useful empty-state onboarding flow, sample workspace clearly labelled as sample, and an import/export path.
- Reliable server-side persistence, backups, error handling, mobile layout, and accessible keyboard controls.
- Public audit form connected to the right workspace/inbox without exposing other customers' submissions.
- Billing state enforced server-side before paid-only features are unlocked.

### Keep optional and free-first
- Public web-search links as manual research aids; they are not a verified-lead API and must not silently scrape sites.
- AI assistance only through explicitly configured providers, with quotas/cost disclosure and a non-AI fallback.
- WhatsApp message preparation with user approval. Actual WhatsApp Business API messaging may have provider approval and costs; do not claim the free app can send it.
- CSV backup/import and simple reports.

### Remove or defer
- Website demo builder and disconnected demo features.
- Unused AI-provider selectors and paid integrations that cannot be tested.
- Fake/demo leads mixed into real customer records.
- Unused charts, vanity metrics, duplicated tools, and buttons that have no real action.
- Automatic scraping or claims of unlimited free verified leads.
- Complex payroll/accounting, social scheduling, full website builder, and general-purpose workflow automation until customers request and pay for them.

## 4. Zero-cost-first architecture

Keep the existing React + Vite frontend, Express backend, PostgreSQL data layer, and current repository while they are stable. Do not rewrite the stack just because a new boilerplate exists.

- **Frontend:** React, Vite, existing Lucide icons and CSS; open-source dependencies only.
- **Backend:** Node.js + Express with server-side validation and authorization.
- **Database:** current PostgreSQL/Neon setup initially; migrations must be additive and tested. Evaluate self-hosted PostgreSQL only when a stable host and backups are available.
- **Authentication:** harden the existing account/session system before introducing another auth library.
- **Tests:** Node test runner, API authorization tests, and build checks; add Playwright if it can run in CI without a paid service.
- **AI:** optional provider adapters with a disabled-by-default state. No AI call should be required for CRUD, reporting, or reminders.
- **Research:** ordinary links and manual verification first. Do not depend on quota-limited APIs for the product's core promise.
- **Payments:** use the existing Razorpay setup only after subscription lifecycle, webhook signature verification, idempotency, cancellations, failed payments, and server-side entitlements are tested. International payments/tax compliance need separate verification.
- **Deployment:** use existing free tiers only while their terms permit the intended commercial use and their quotas fit. A “free tier” is not a guarantee of zero cost, uptime, or scale. Set alerts/limits where available and never incur a charge without explicit approval.

### Important cost truth

Open-source software has no licence fee in many cases, but production SaaS still needs hosting, database capacity, backups, email delivery, domains, monitoring, support, payment processing, and security work. The development prototype can start at ₹0 using existing resources and free tiers; sustained worldwide production at meaningful usage cannot responsibly be promised at ₹0 forever.

## 5. Commercial model to test (not yet a promise)

Start with a free trial or free tier that helps a user experience the full workflow without expensive AI usage.

- **Free:** one owner, limited active leads/projects, core pipeline and tasks, manual exports.
- **Solo:** test ₹799–₹999/month for more records, follow-up workflows, and reports.
- **Team:** test ₹1,999–₹2,999/month for multiple users, assignments, shared pipeline, and workspace controls.
- **International:** test approximately US$19–$49/month for comparable tiers, with local pricing adjusted after customer interviews.

These are hypotheses, not validated prices. Interview target customers and ask for paid pilots before building plan-specific complexity. Do not offer unlimited AI, unlimited lead scraping, or unlimited support on a low-price plan.

## 6. Revenue arithmetic (illustrative, not a forecast)

- 100 customers × ₹999/month = ₹99,900 monthly recurring revenue (MRR).
- 1,000 customers × ₹999/month = ₹9,99,000 MRR.
- 1,000 customers × ₹2,499/month = ₹24,99,000 MRR.
- 4,000 customers × ₹2,499/month = ₹99,96,000 MRR.

These are gross subscription calculations before payment fees, taxes, refunds, hosting, support, salaries, and churn. Reaching these customer counts requires repeatable acquisition, retention, onboarding, and support—not just software.

## 7. Go-to-market: India first, global-ready

1. Recruit 5–10 design partners from service businesses and personally onboard them.
2. Observe real usage for 2–4 weeks; record which follow-ups, delivery tasks, and collections the product actually helps.
3. Charge for a small paid pilot once the core flow and data isolation are dependable.
4. Publish honest demos using clearly labelled sample data; collect permission before publishing testimonials or customer data.
5. Acquire customers through direct outreach, partner referrals, useful templates, and customer case studies—not paid ads initially.
6. Improve onboarding and retention before adding more modules.
7. Expand internationally after timezone, currency, date/number formatting, privacy, support, billing, and tax implications are reviewed.

### Metrics that matter
- time from signup to first real lead entered;
- percentage of leads with a next action;
- weekly active workspaces;
- follow-ups completed on time;
- enquiry-to-customer conversion where customers track outcomes;
- overdue invoice balance and collection time;
- trial-to-paid conversion, monthly churn, and support load.

Do not display these as company achievements until real product events support them.

## 8. Build order and release gates

### Phase 1 — Audit and simplify
Inventory every visible route and action. Mark each **Working**, **Limited**, or **Unavailable** using actual tests. Remove dead UI; preserve existing customer data and the public audit inbox.

### Phase 2 — Secure multi-tenant core
Verify account/workspace isolation in API tests. Every business record must have a trusted server-derived workspace owner. Never trust a client-supplied organization ID. Add additive migrations and tests before changing stored data.

### Phase 3 — Complete lead-to-cash workflow
Make lead → follow-up → customer → project/task → invoice/payment tracking → report work end-to-end with refresh persistence and error states.

### Phase 4 — Paid SaaS readiness
Test signup, email/session lifecycle, usage limits, billing webhooks, entitlement enforcement, cancellation, failed payment, data export, backups, privacy terms, and account deletion. Never claim a subscription is active based only on the browser UI.

### Phase 5 — Pilot and validate
Onboard design partners, measure usage, resolve bugs, and validate willingness to pay before broad launch.

### Phase 6 — Expand only from evidence
Prioritize requests that recur across paying customers. AI, messaging integrations, industry templates, and advanced automation are additions—not substitutes for a dependable core.

## 9. Definition of done for every feature

A feature is not complete because it renders. Verify:
- create, read, edit, archive/delete with safe confirmation;
- refresh and re-login persistence;
- server-side authorization and cross-workspace denial;
- empty, loading, validation, and server-error states;
- keyboard and mobile behavior;
- export/backup implications;
- automated test and successful build;
- copy that accurately describes the actual integration and data persistence.

**North-star rule:** One complete, trusted workflow used by paying customers is more valuable than twenty impressive-looking modules that do not reliably work.
