# Prospect CRM email removal

Email collection and email outreach have been removed from **prospect CRM
workflows**. This document records the exact scope, the legacy-data migration,
and the breaking change to the CSV export schema.

## Scope

### Removed

| Area | Detail |
|---|---|
| CRM record | `email`, `emailVerifiedByUser`, `emailPermissionConfirmed`, `enrichmentEmail` |
| Enrichment | `enrichmentEmail` is no longer written; `'email'` removed from the allowed `enrichmentEvidence` fields |
| Outreach | `buildOutreach()` no longer returns `subject` or `emailBody`; `validateOutreachContact('email', …)` always refuses |
| Manual leads | `email` removed from `MANUAL_LEAD_FIELDS`, `MANUAL_FIELD_LABELS`, `EMPTY_VALUES` and `HEADER_ALIASES`; no email validation |
| Leads table | Email column and “Add email” button removed |
| Lead drawer | Business email input, “I verified this business email” and “Email contact basis confirmed” rows removed |
| Outreach modal | WhatsApp-only; no channel tabs |
| CSV export | Three columns removed (below) |

### Deliberately kept

- **`src/site/RevoltzSite.jsx` contact form.** This is *inbound* enquiry, not
  prospect outreach. It still builds a `mailto:` draft in the visitor's browser,
  and it is the source for the Audit Inbox. The deployed marketing site is
  unchanged.
- **`server/enrich.js` email extraction** (public-website signal). The CRM
  simply no longer stores the discovered value, so the public-signal feature and
  its tests are preserved.

## Legacy data migration (D3)

Stored CRM data lives in the browser's `localStorage`. Earlier versions may hold
email keys.

- `stripLegacyCrmEmail()` in `src/lib/crm.js` removes exactly the four legacy
  fields and nothing else.
- It is called **inside `updateCrmRecord()`** on both the stored record and any
  incoming patch, so every read/write path is covered and a patch cannot smuggle
  an email back in.
- Called again in `cleanCrmRecord()` in `src/App.jsx`.
- Manual-lead records are handled in `readManualLeads()` and
  `applyManualLeadUpdate()`.

Properties, all covered by `tests/crmEmailRemoval.test.js`:

- **Idempotent** — running it twice equals running it once.
- **Total** — never throws on `undefined`, `null`, primitives, or arrays.
- **Non-mutating** — returns a fresh object; the input is untouched.
- **Selective** — status, notes, tags, follow-up dates, service, estimate,
  phone, WhatsApp opt-in and every enrichment field other than email survive.
- **No blanket clearing** — nothing else in `localStorage` is touched or deleted.

## Breaking change: CSV export schema (D6)

These columns were removed from `buildWorkflowCsv()`:

| Removed column |
|---|
| `user_entered_business_email` |
| `user_verified_email_by_user` |
| `user_email_contact_basis_confirmed` |

A pre-change check confirmed the three getters appeared **only** in
`src/lib/csv.js`; no other code path read them. All other columns are unchanged.

**Import stays backward compatible.** `parseManualLeadCsv()` no longer maps an
`Email` header, so a legacy CSV:

- imports successfully;
- **ignores** the Email column and its values;
- never rejects a row because of a malformed email in that column;
- never mistakes the Email column for the business-name column (it remains in
  the fallback-name skip list).

Covered by `tests/crmEmailRemoval.test.js`.

## Verification

`npm test` → 137/137. Relevant suites:

- `tests/crmEmailRemoval.test.js` — record shape, stripping, idempotence,
  outreach gates, enrichment, legacy manual leads, CSV export/import.
- `tests/outreach.test.js` — WhatsApp gates preserved, email refused.
- `tests/enrich.test.js` — server extraction intact, CRM storage removed.
- `tests/manualLeads.test.js`, `tests/manualQualification.test.js`,
  `tests/qualification.test.js` — updated for the new schema.
