/**
 * AgencyOS — shared domain types.
 *
 * Design rule: everything derived from the Google Places API (New) lives in
 * `PlaceSnapshot` and is timestamped, because Google's Places policies only
 * allow indefinite storage of `place_id`. All other place data must be
 * refreshable and is flagged when it becomes stale.
 */

export type LeadStatus =
  | 'NEW'
  | 'RESEARCHED'
  | 'CONTACTED'
  | 'REPLIED'
  | 'INTERESTED'
  | 'CALL_BOOKED'
  | 'PROPOSAL'
  | 'WON'
  | 'LOST'
  | 'DO_NOT_CONTACT';

export const LEAD_STATUSES: LeadStatus[] = [
  'NEW',
  'RESEARCHED',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'CALL_BOOKED',
  'PROPOSAL',
  'WON',
  'LOST',
  'DO_NOT_CONTACT',
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  RESEARCHED: 'Researched',
  CONTACTED: 'Contacted',
  REPLIED: 'Replied',
  INTERESTED: 'Interested',
  CALL_BOOKED: 'Call booked',
  PROPOSAL: 'Proposal',
  WON: 'Won',
  LOST: 'Lost',
  DO_NOT_CONTACT: 'Do not contact',
};

/** Pipeline stages used by the dashboard funnel. */
export const FUNNEL_STAGES: LeadStatus[] = [
  'NEW',
  'RESEARCHED',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'CALL_BOOKED',
  'PROPOSAL',
  'WON',
];

export type ServiceKey =
  | 'WEBSITE'
  | 'AI_AUTOMATION'
  | 'AI_CHATBOT'
  | 'LEAD_GENERATION'
  | 'SOCIAL_MEDIA'
  | 'FINANCE_AUTOMATION';

export const SERVICES: { key: ServiceKey; label: string; defaultDealValue: number }[] = [
  { key: 'WEBSITE', label: 'Website', defaultDealValue: 45000 },
  { key: 'AI_AUTOMATION', label: 'AI Automation', defaultDealValue: 75000 },
  { key: 'AI_CHATBOT', label: 'AI Chatbot', defaultDealValue: 40000 },
  { key: 'LEAD_GENERATION', label: 'Lead Generation', defaultDealValue: 60000 },
  { key: 'SOCIAL_MEDIA', label: 'Social Media', defaultDealValue: 30000 },
  { key: 'FINANCE_AUTOMATION', label: 'Finance Automation', defaultDealValue: 90000 },
];

export const SERVICE_LABELS: Record<ServiceKey, string> = SERVICES.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.label }),
  {} as Record<ServiceKey, string>,
);

export type ScoreBand = 'HIGH' | 'MEDIUM' | 'LOW';

export type FactorState = 'awarded' | 'not-met' | 'unknown';

export interface ScoreFactor {
  key:
    | 'no_website'
    | 'weak_website'
    | 'review_volume'
    | 'strong_rating'
    | 'active_business'
    | 'missing_enquiry_flow'
    | 'social_presence';
  label: string;
  maxPoints: number;
  awarded: number;
  state: FactorState;
  /** What was actually observed. Never a guess. */
  evidence: string;
}

export interface OpportunityScore {
  score: number;
  band: ScoreBand;
  /** Points that were reachable given the data we actually have. */
  maxScoreable: number;
  /** 0-100 — how much of the model could be evaluated with retrieved data. */
  dataCoverage: number;
  factors: ScoreFactor[];
  /** Short human explanation, built only from verified facts. */
  reason: string;
  generatedBy: 'ai' | 'template';
  computedAt: string;
}

export interface PlaceSnapshot {
  placeId: string;
  displayName: string;
  formattedAddress: string | null;
  nationalPhoneNumber: string | null;
  internationalPhoneNumber: string | null;
  websiteUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
  primaryType: string | null;
  types: string[];
  businessStatus: string | null;
  openNow: boolean | null;
  priceLevel: string | null;
  /** When this snapshot was retrieved from the provider. */
  retrievedAt: string;
  source: 'google_places' | 'demo';
}

export interface SearchQueryRecord {
  industry: string;
  city: string;
  radiusKm: number | null;
  latitude: number | null;
  longitude: number | null;
  maxResults: number;
  executedAt: string;
  mode: 'live' | 'demo';
}

export type AnalysisResult = 'pass' | 'warn' | 'fail' | 'unknown';

export interface WebsiteSignal {
  key: string;
  label: string;
  result: AnalysisResult;
  detail: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface WebsiteAnalysis {
  leadId: string;
  url: string;
  analyzedAt: string;
  /** 'live' = real fetch, 'demo' = simulated from the demo record. */
  mode: 'live' | 'demo';
  fetched: boolean;
  skippedReason?: string;
  robotsAllowed: boolean;
  http?: {
    status: number;
    finalUrl: string;
    contentType: string | null;
    bytes: number;
    durationMs: number;
    lastModified: string | null;
  };
  signals: WebsiteSignal[];
  /** 0-100 heuristic quality of the fetched HTML surface. */
  siteScore: number;
  siteQuality: 'weak' | 'moderate' | 'strong' | 'unknown';
  socialLinks: SocialLink[];
  findings: {
    mobileFriendly: AnalysisResult;
    outdatedDesign: AnalysisResult;
    missingCta: AnalysisResult;
    missingWhatsappFlow: AnalysisResult;
    missingContactFlow: AnalysisResult;
    missingBusinessInfo: AnalysisResult;
    conversionIssues: string[];
    discoveredEmail: string | null;
  };
  potentialOpportunity: string;
  generatedBy: 'ai' | 'template';
  disclaimer: string;
}

export type PitchTone = 'professional' | 'friendly' | 'direct';

export interface OutreachDraft {
  leadId: string;
  generatedAt: string;
  generatedBy: 'ai' | 'template';
  tone: PitchTone;
  emailSubject: string;
  emailBody: string;
  whatsappDraft: string;
  /** Verified observations the copy is based on (transparency). */
  factsUsed: string[];
  mailtoHref: string | null;
  whatsappHref: string | null;
  model?: string | null;
}

export interface StatusEvent {
  status: LeadStatus;
  at: string;
  note?: string | null;
}

export interface LeadCrm {
  notes: string;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  assignedService: ServiceKey | null;
  estimatedDealValue: number | null;
  currency: string;
  owner: string | null;
}

export interface Lead {
  id: string;
  createdAt: string;
  updatedAt: string;
  place: PlaceSnapshot;
  query: SearchQueryRecord | null;
  /** Only ever populated from a real source (mailto found on the site, or typed by the user). */
  email: string | null;
  emailSource: 'website_analysis' | 'manual' | 'demo' | null;
  score: OpportunityScore | null;
  analysis: WebsiteAnalysis | null;
  outreach: OutreachDraft | null;
  status: LeadStatus;
  statusHistory: StatusEvent[];
  crm: LeadCrm;
  campaignId: string | null;
  tags: string[];
  isDemo: boolean;
}

export interface FollowUpStep {
  day: number;
  label: string;
  channel: 'email' | 'whatsapp' | 'call';
  note: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  service: ServiceKey | null;
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
  sequence: FollowUpStep[];
  /** Manual-send-only compliance acknowledgement. */
  manualSendOnly: true;
}

export interface AgencyProfile {
  name: string;
  senderName: string;
  senderEmail: string;
  whatsappNumber: string;
  website: string;
  city: string;
  defaultCountryCode: string;
  currency: string;
}

export interface PitchDefaults {
  tone: PitchTone;
  services: ServiceKey[];
  introLine: string;
  offerLine: string;
  ctaLine: string;
}

export interface DataPolicy {
  /** Days after which a Google Places snapshot is flagged stale. */
  googleDataMaxAgeDays: number;
  /** Days after which stale snapshots are offered for purge. */
  purgeAfterDays: number;
  keepOnlyPlaceIdWhenPurging: boolean;
}

export interface Settings {
  agency: AgencyProfile;
  pitch: PitchDefaults;
  dataPolicy: DataPolicy;
  demoMode: boolean;
  updatedAt: string;
}

/** Manually maintained suppression list (phones / emails / domains / businesses). */
export interface SuppressionEntry {
  id: string;
  kind: 'phone' | 'email' | 'domain' | 'business';
  value: string;
  reason: string;
  createdAt: string;
}

export interface DatabaseShape {
  version: number;
  leads: Lead[];
  campaigns: Campaign[];
  suppression: SuppressionEntry[];
  settings: Settings;
  searches: SearchQueryRecord[];
}

export interface ConfigStatus {
  googlePlaces: {
    configured: boolean;
    regionCode: string;
    languageCode: string;
    missingVars: string[];
  };
  ai: {
    configured: boolean;
    provider: 'openai' | 'gemini' | null;
    model: string | null;
    base_url_custom: boolean;
  };
  websiteAnalysis: {
    enabled: boolean;
    timeoutMs: number;
    maxBytes: number;
  };
  storage: {
    driver: 'json-file' | 'memory';
    path: string;
    persistent: boolean;
  };
  demoMode: boolean;
  counts: {
    leads: number;
    campaigns: number;
    suppression: number;
  };
  version: string;
}
