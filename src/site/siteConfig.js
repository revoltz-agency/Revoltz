// ============================================================================
// Public site configuration — edit these values before launch.
//
// Everything the marketing site needs to change per deployment lives here so
// no copy has to be hunted through components.
// ============================================================================

/** Primary contact address. Shown in the final CTA and the footer. */
export const CONTACT_EMAIL = 'revoltz.agency@gmail.com';

/** Subject line used for the email-based free audit request. */
export const CONTACT_SUBJECT = 'Free AI Audit Request — REVOLTZ AI';

/** AgencyOS API used by the public enquiry form. Override at build time if the host changes. */
export const AUDIT_API_BASE_URL = (import.meta.env?.VITE_AUDIT_API_BASE_URL || 'https://revoltz-agencyos.onrender.com').replace(/\/+$/, '');
