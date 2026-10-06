/**
 * Server-only configuration.
 *
 * Every credential is read here (Node runtime) and is never imported by a
 * client component. The only thing the browser ever sees is a boolean
 * "is it configured" flag from `/api/status`.
 */

export interface AppConfig {
  googlePlaces: {
    apiKey: string | null;
    configured: boolean;
    /** Official endpoint by default; overridable only for a proxy or tests. */
    baseUrl: string;
    regionCode: string;
    languageCode: string;
    dataMaxAgeDays: number;
    missingVars: string[];
  };
  ai: {
    enabled: boolean;
    provider: 'openai' | 'gemini' | null;
    apiKey: string | null;
    baseUrl: string;
    model: string;
    customBaseUrl: boolean;
  };
  websiteAnalysis: {
    enabled: boolean;
    timeoutMs: number;
    maxBytes: number;
    userAgent: string;
    /** TESTING ONLY — lets the analyzer fetch localhost/private hosts. Keep false. */
    allowPrivate: boolean;
  };
  agency: {
    name: string;
    senderName: string;
    senderEmail: string;
    whatsappNumber: string;
    city: string;
    defaultCountryCode: string;
    currency: string;
  };
  storage: {
    file: string;
    seedDemo: boolean;
  };
  demoMode: boolean;
  version: string;
}

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

function int(name: string, fallback: number): number {
  const raw = str(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = str(name).toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function build(): AppConfig {
  const placesKey = str('GOOGLE_PLACES_API_KEY');
  const missingVars: string[] = [];
  if (!placesKey) missingVars.push('GOOGLE_PLACES_API_KEY');

  const openaiKey = str('OPENAI_API_KEY');
  const geminiKey = str('GEMINI_API_KEY');
  const aiEnabled = bool('AI_ENABLED', true);
  const baseUrl = str('OPENAI_BASE_URL', DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
  const provider: AppConfig['ai']['provider'] = openaiKey
    ? 'openai'
    : geminiKey
      ? 'gemini'
      : null;

  const model =
    provider === 'gemini'
      ? str('GEMINI_MODEL', 'gemini-2.0-flash')
      : str('OPENAI_MODEL', 'gpt-4o-mini');

  return {
    googlePlaces: {
      apiKey: placesKey || null,
      configured: Boolean(placesKey),
      baseUrl: str('GOOGLE_PLACES_BASE_URL', 'https://places.googleapis.com/v1').replace(/\/$/, ''),
      regionCode: str('GOOGLE_PLACES_REGION_CODE', 'IN').toUpperCase(),
      languageCode: str('GOOGLE_PLACES_LANGUAGE_CODE', 'en'),
      dataMaxAgeDays: int('GOOGLE_DATA_MAX_AGE_DAYS', 30),
      missingVars,
    },
    ai: {
      enabled: aiEnabled && provider !== null,
      provider,
      apiKey: (openaiKey || geminiKey || null) as string | null,
      baseUrl,
      model,
      customBaseUrl: baseUrl !== DEFAULT_OPENAI_BASE_URL,
    },
    websiteAnalysis: {
      enabled: bool('WEBSITE_ANALYSIS_ENABLED', true),
      timeoutMs: int('WEBSITE_ANALYSIS_TIMEOUT_MS', 10_000),
      maxBytes: int('WEBSITE_ANALYSIS_MAX_BYTES', 786_432),
      userAgent: str(
        'WEBSITE_ANALYSIS_USER_AGENT',
        'AgencyOSBot/1.0 (+https://github.com/revoltz-agency/Revoltz; lead-research)',
      ),
      allowPrivate: bool('WEBSITE_ANALYSIS_ALLOW_PRIVATE', false),
    },
    agency: {
      name: str('AGENCY_NAME', 'AgencyOS'),
      senderName: str('AGENCY_SENDER_NAME', ''),
      senderEmail: str('AGENCY_SENDER_EMAIL', ''),
      whatsappNumber: str('AGENCY_WHATSAPP_NUMBER', ''),
      city: str('AGENCY_DEFAULT_CITY', 'Pune'),
      defaultCountryCode: str('DEFAULT_COUNTRY_CODE', '91'),
      currency: str('DEFAULT_CURRENCY', 'INR'),
    },
    storage: {
      file: str('AGENCYOS_DATA_FILE', './data/agencyos.json'),
      seedDemo: bool('AGENCYOS_SEED_DEMO', true),
    },
    /**
     * Demo Mode is not a user preference here — it is the honest state of the
     * app when no Places key exists. Users can still force it while a key is
     * configured (useful for demos), via `settings.demoMode`.
     */
    demoMode: !placesKey,
    version: str('npm_package_version', '1.0.0'),
  };
}

let cached: AppConfig | null = null;

/** Server-side config snapshot (cached per process). */
export function getConfig(): AppConfig {
  if (!cached) cached = build();
  return cached;
}

/** Force re-read of env (used after tests / hot reload). */
export function resetConfigCache(): void {
  cached = null;
}

export function isGoogleConfigured(): boolean {
  return getConfig().googlePlaces.configured;
}

export function isAiConfigured(): boolean {
  return getConfig().ai.enabled;
}
