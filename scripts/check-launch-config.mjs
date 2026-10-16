import { pathToFileURL } from 'node:url';

const REQUIRED_VALUES = [
  ['DATABASE_URL', (value) => /^postgres(?:ql)?:\/\//i.test(value), 'PostgreSQL connection string'],
  ['RAZORPAY_KEY_ID', (value) => value.length > 0, 'Razorpay API key ID'],
  ['RAZORPAY_KEY_SECRET', (value) => value.length > 0, 'Razorpay API secret'],
  ['RAZORPAY_PLAN_ID_STARTER', (value) => value.length > 0, 'Razorpay monthly plan ID'],
  ['RAZORPAY_WEBHOOK_SECRET', (value) => value.length > 0, 'Razorpay webhook signing secret'],
  ['GOOGLE_MAPS_API_KEY', (value) => value.length > 0, 'Google Places API key'],
  ['AUDIT_OWNER_PASSWORD_HASH', (value) => /^scrypt\$[a-f0-9]+\$[a-f0-9]+$/i.test(value), 'Audit Inbox password hash'],
  ['AUDIT_ALLOWED_ORIGINS', (value) => value.split(',').some((origin) => {
    try {
      const parsed = new URL(origin.trim());
      return ['https:', 'http:'].includes(parsed.protocol) && parsed.origin === origin.trim();
    } catch { return false; }
  }), 'Exact allowed origins for Audit Inbox writes'],
];

export function validateLaunchConfiguration(env = process.env) {
  const checks = REQUIRED_VALUES.map(([key, validate, description]) => {
    const value = String(env[key] || '').trim();
    return { key, description, ok: Boolean(value) && validate(value) };
  });

  checks.push(
    {
      key: 'AGENCYOS_BILLING_ENFORCED',
      description: 'Subscription enforcement enabled',
      ok: String(env.AGENCYOS_BILLING_ENFORCED || '').trim().toLowerCase() === 'true',
    },
    {
      key: 'AUDIT_PUBLIC_INTAKE_ENABLED',
      description: 'Public audit intake enabled',
      ok: String(env.AUDIT_PUBLIC_INTAKE_ENABLED || '').trim().toLowerCase() === 'true',
    },
    {
      key: 'TRUST_PROXY_HOPS',
      description: 'Trusted proxy hop count configured',
      ok: Number.isInteger(Number(env.TRUST_PROXY_HOPS)) && Number(env.TRUST_PROXY_HOPS) >= 1,
    },
  );

  return { ready: checks.every((check) => check.ok), checks };
}

function run() {
  const result = validateLaunchConfiguration();
  console.log('AgencyOS paid-launch configuration preflight');
  for (const check of result.checks) {
    console.log(`${check.ok ? 'PASS' : 'BLOCK'}  ${check.key} — ${check.description}`);
  }
  if (!result.ready) {
    console.error('Launch blocked: fix the missing or invalid settings in the hosting dashboard, then rerun this check.');
    process.exitCode = 1;
  } else {
    console.log('Configuration preflight passed. This checks environment values only; it does not contact PostgreSQL, Razorpay, Google, or verify a deployed webhook.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
