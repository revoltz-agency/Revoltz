/**
 * V1 persistence layer — a single JSON document on disk.
 *
 * Deliberately tiny and dependency-free, and every mutation goes through this
 * module so the driver can be swapped for Postgres/Prisma later without
 * touching route handlers or UI. If the filesystem is read-only (serverless)
 * the store degrades to in-memory and reports `persistent: false` via
 * `/api/status`.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  Campaign,
  DatabaseShape,
  Lead,
  LeadStatus,
  PlaceSnapshot,
  ScoreBand,
  SearchQueryRecord,
  Settings,
  SuppressionEntry,
} from '../types';
import { getConfig } from '../config';
import { daysBetween, newId, nowIso } from '../utils';
import { computeOpportunityScore } from '../scoring/opportunity';
import { buildDemoLeads } from './seed';
import { defaultCampaigns, defaultSettings, defaultSuppression } from './defaults';

const DB_VERSION = 1;

declare global {
  // eslint-disable-next-line no-var
  var __agencyos_db: { db: DatabaseShape; persistent: boolean; path: string; lastError: string | null } | undefined;
}

function emptyDb(): DatabaseShape {
  return {
    version: DB_VERSION,
    leads: [],
    campaigns: defaultCampaigns(),
    suppression: defaultSuppression(),
    settings: defaultSettings(),
    searches: [],
  };
}

function resolveDataFile(): string {
  const configured = getConfig().storage.file;
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function seedIfEmpty(db: DatabaseShape): DatabaseShape {
  if (db.leads.length > 0) return db;
  if (!getConfig().storage.seedDemo) return db;
  const { leads, campaign } = buildDemoLeads();
  db.leads = leads;
  db.campaigns = [campaign, ...db.campaigns];
  return db;
}

function load(): { db: DatabaseShape; persistent: boolean; path: string; lastError: string | null } {
  const file = resolveDataFile();
  let db = emptyDb();
  let persistent = false;
  let lastError: string | null = null;

  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DatabaseShape>;
      db = {
        ...emptyDb(),
        ...parsed,
        version: DB_VERSION,
        leads: Array.isArray(parsed.leads) ? parsed.leads : [],
        campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
        suppression: Array.isArray(parsed.suppression) ? parsed.suppression : [],
        searches: Array.isArray(parsed.searches) ? parsed.searches : [],
        settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
      };
      persistent = true;
    } else {
      // No file yet — try to create it so we know whether persistence works.
      fs.mkdirSync(path.dirname(file), { recursive: true });
      db = seedIfEmpty(db);
      persist(db, file);
      persistent = true;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    db = seedIfEmpty(emptyDb());
    persistent = false;
  }

  if (!persistent) {
    db = seedIfEmpty(db);
  }
  return { db, persistent, path: file, lastError };
}

function persist(db: DatabaseShape, file: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function state() {
  if (!globalThis.__agencyos_db) {
    globalThis.__agencyos_db = load();
  }
  return globalThis.__agencyos_db;
}

/** Read the whole database (server-side only). */
export function getDb(): DatabaseShape {
  return state().db;
}

export function storageInfo() {
  const s = state();
  return {
    driver: (s.persistent ? 'json-file' : 'memory') as 'json-file' | 'memory',
    path: s.path,
    persistent: s.persistent,
    lastError: s.lastError,
  };
}

function commit(): void {
  const s = state();
  if (!s.persistent) return;
  try {
    persist(s.db, s.path);
    s.lastError = null;
  } catch (err) {
    s.persistent = false;
    s.lastError = err instanceof Error ? err.message : String(err);
  }
}

// ─────────────────────────── leads ───────────────────────────

export interface LeadFilters {
  ids?: string[];
  q?: string;
  statuses?: LeadStatus[];
  bands?: ScoreBand[];
  service?: string;
  campaignId?: string | null;
  hasWebsite?: boolean;
  hasPhone?: boolean;
  hasEmail?: boolean;
  isDemo?: boolean;
  staleOnly?: boolean;
  sortBy?: keyof LeadSortMap;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export type LeadSortMap = {
  score: number;
  rating: number;
  reviews: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  nextFollowUpAt: string;
  dealValue: number;
};

export function isStale(lead: Lead, maxAgeDays = getConfig().googlePlaces.dataMaxAgeDays): boolean {
  if (lead.isDemo) return false;
  if (lead.place.source !== 'google_places') return false;
  return daysBetween(lead.place.retrievedAt) > maxAgeDays;
}

export function listLeads(filters: LeadFilters = {}): { leads: Lead[]; total: number } {
  const db = getDb();
  let rows = [...db.leads];

  if (filters.ids?.length) {
    const ids = new Set(filters.ids);
    rows = rows.filter((l) => ids.has(l.id));
  }
  if (filters.q) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter((l) =>
      [l.place.displayName, l.place.formattedAddress ?? '', l.place.primaryType ?? '', l.crm.notes, l.tags.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }
  if (filters.statuses?.length) {
    rows = rows.filter((l) => filters.statuses!.includes(l.status));
  }
  if (filters.bands?.length) {
    rows = rows.filter((l) => l.score && filters.bands!.includes(l.score.band));
  }
  if (filters.service) {
    rows = rows.filter((l) => l.crm.assignedService === filters.service);
  }
  if (filters.campaignId !== undefined) {
    rows = rows.filter((l) => (filters.campaignId === null ? l.campaignId === null : l.campaignId === filters.campaignId));
  }
  if (filters.hasWebsite !== undefined) {
    rows = rows.filter((l) => Boolean(l.place.websiteUri) === filters.hasWebsite);
  }
  if (filters.hasPhone !== undefined) {
    rows = rows.filter((l) => Boolean(l.place.internationalPhoneNumber || l.place.nationalPhoneNumber) === filters.hasPhone);
  }
  if (filters.hasEmail !== undefined) {
    rows = rows.filter((l) => Boolean(l.email) === filters.hasEmail);
  }
  if (filters.isDemo !== undefined) {
    rows = rows.filter((l) => l.isDemo === filters.isDemo);
  }
  if (filters.staleOnly) {
    rows = rows.filter((l) => isStale(l));
  }

  const dir = filters.sortDir === 'asc' ? 1 : -1;
  const sortKey = filters.sortBy ?? 'score';
  const valueOf = (l: Lead): number | string => {
    switch (sortKey) {
      case 'rating':
        return l.place.rating ?? -1;
      case 'reviews':
        return l.place.userRatingCount ?? -1;
      case 'name':
        return l.place.displayName.toLowerCase();
      case 'createdAt':
        return l.createdAt;
      case 'updatedAt':
        return l.updatedAt;
      case 'nextFollowUpAt':
        return l.crm.nextFollowUpAt ?? '9999-12-31';
      case 'dealValue':
        return l.crm.estimatedDealValue ?? -1;
      case 'score':
      default:
        return l.score?.score ?? -1;
    }
  };
  rows.sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv)) * dir;
    }
    return (av - bv) * dir;
  });

  const total = rows.length;
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? rows.length;
  return { leads: rows.slice(offset, offset + limit), total };
}

export function getLead(id: string): Lead | null {
  return getDb().leads.find((l) => l.id === id) ?? null;
}

export function findLeadByPlaceId(placeId: string): Lead | null {
  return getDb().leads.find((l) => l.place.placeId === placeId) ?? null;
}

export interface UpsertPlaceInput {
  place: PlaceSnapshot;
  query: SearchQueryRecord | null;
  isDemo?: boolean;
  campaignId?: string | null;
}

/**
 * Insert a lead, or refresh the Google snapshot of an existing one.
 * User-owned data (status, notes, CRM fields, drafts, analysis) is preserved.
 */
export function upsertLeadFromPlace(input: UpsertPlaceInput): { lead: Lead; created: boolean } {
  const db = getDb();
  const existing = db.leads.find((l) => l.place.placeId === input.place.placeId);
  if (existing) {
    existing.place = input.place;
    if (input.query) existing.query = input.query;
    existing.score = computeOpportunityScore({ place: input.place, analysis: existing.analysis });
    existing.updatedAt = nowIso();
    commit();
    return { lead: existing, created: false };
  }

  const lead: Lead = {
    id: newId('lead'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    place: input.place,
    query: input.query,
    email: null,
    emailSource: null,
    score: computeOpportunityScore({ place: input.place, analysis: null }),
    analysis: null,
    outreach: null,
    status: 'NEW',
    statusHistory: [{ status: 'NEW', at: nowIso() }],
    crm: {
      notes: '',
      lastContactedAt: null,
      nextFollowUpAt: null,
      assignedService: null,
      estimatedDealValue: null,
      currency: db.settings.agency.currency,
      owner: null,
    },
    campaignId: input.campaignId ?? null,
    tags: input.isDemo ? ['demo'] : [],
    isDemo: Boolean(input.isDemo) || input.place.source === 'demo',
  };
  db.leads.unshift(lead);
  commit();
  return { lead, created: true };
}

export type LeadPatch = Partial<
  Pick<Lead, 'email' | 'emailSource' | 'status' | 'analysis' | 'outreach' | 'score' | 'campaignId' | 'tags' | 'place'>
> & {
  crm?: Partial<Lead['crm']>;
  note?: string | null;
};

export function updateLead(id: string, patch: LeadPatch): Lead | null {
  const db = getDb();
  const lead = db.leads.find((l) => l.id === id);
  if (!lead) return null;

  if (patch.status && patch.status !== lead.status) {
    lead.status = patch.status;
    lead.statusHistory.push({ status: patch.status, at: nowIso(), note: patch.note ?? null });
    if (patch.status === 'CONTACTED' && !lead.crm.lastContactedAt) {
      lead.crm.lastContactedAt = nowIso();
    }
    if (patch.status === 'DO_NOT_CONTACT') {
      addSuppressionFromLead(lead, patch.note ?? 'Marked DO NOT CONTACT');
    }
  }
  if (patch.crm) lead.crm = { ...lead.crm, ...patch.crm };
  if (patch.email !== undefined) lead.email = patch.email;
  if (patch.emailSource !== undefined) lead.emailSource = patch.emailSource;
  if (patch.analysis !== undefined) lead.analysis = patch.analysis;
  if (patch.outreach !== undefined) lead.outreach = patch.outreach;
  if (patch.campaignId !== undefined) lead.campaignId = patch.campaignId;
  if (patch.tags !== undefined) lead.tags = patch.tags;
  if (patch.place !== undefined) lead.place = patch.place;
  if (patch.score !== undefined) lead.score = patch.score;

  // Re-score whenever the underlying evidence changed.
  if (patch.analysis !== undefined || patch.place !== undefined) {
    lead.score = computeOpportunityScore({ place: lead.place, analysis: lead.analysis });
  }

  lead.updatedAt = nowIso();
  commit();
  return lead;
}

export function bulkUpdateLeads(ids: string[], patch: LeadPatch): number {
  let count = 0;
  for (const id of ids) {
    const updated = updateLead(id, patch);
    if (updated) count += 1;
  }
  return count;
}

export function deleteLead(id: string): boolean {
  const db = getDb();
  const before = db.leads.length;
  db.leads = db.leads.filter((l) => l.id !== id);
  const removed = db.leads.length < before;
  if (removed) commit();
  return removed;
}

export function deleteLeads(ids: string[]): number {
  const db = getDb();
  const before = db.leads.length;
  db.leads = db.leads.filter((l) => !ids.includes(l.id));
  const removed = before - db.leads.length;
  if (removed > 0) commit();
  return removed;
}

/** Drop cached Google place fields, keeping place_id + CRM data (policy-safe purge). */
export function purgeStalePlaceData(maxAgeDays: number): number {
  const db = getDb();
  let purged = 0;
  for (const lead of db.leads) {
    if (lead.isDemo || lead.place.source !== 'google_places') continue;
    if (daysBetween(lead.place.retrievedAt) <= maxAgeDays) continue;
    lead.place = {
      placeId: lead.place.placeId,
      displayName: lead.place.displayName,
      formattedAddress: null,
      nationalPhoneNumber: null,
      internationalPhoneNumber: null,
      websiteUri: null,
      rating: null,
      userRatingCount: null,
      googleMapsUri: null,
      primaryType: lead.place.primaryType,
      types: [],
      businessStatus: null,
      openNow: null,
      priceLevel: null,
      retrievedAt: lead.place.retrievedAt,
      source: 'google_places',
    };
    lead.tags = [...new Set([...lead.tags, 'needs-refresh'])];
    lead.updatedAt = nowIso();
    purged += 1;
  }
  if (purged > 0) commit();
  return purged;
}

// ─────────────────────────── campaigns ───────────────────────────

export function listCampaigns(): Campaign[] {
  return getDb().campaigns;
}

export function getCampaign(id: string): Campaign | null {
  return getDb().campaigns.find((c) => c.id === id) ?? null;
}

export function saveCampaign(campaign: Campaign): Campaign {
  const db = getDb();
  const idx = db.campaigns.findIndex((c) => c.id === campaign.id);
  campaign.updatedAt = nowIso();
  if (idx >= 0) db.campaigns[idx] = campaign;
  else db.campaigns.unshift(campaign);
  commit();
  return campaign;
}

export function deleteCampaign(id: string): boolean {
  const db = getDb();
  const before = db.campaigns.length;
  db.campaigns = db.campaigns.filter((c) => c.id !== id);
  for (const lead of db.leads) {
    if (lead.campaignId === id) lead.campaignId = null;
  }
  const removed = db.campaigns.length < before;
  if (removed) commit();
  return removed;
}

export function leadsForCampaign(campaignId: string): Lead[] {
  return getDb().leads.filter((l) => l.campaignId === campaignId);
}

// ─────────────────────────── settings & suppression ───────────────────────────

export function getSettings(): Settings {
  return getDb().settings;
}

export interface SettingsPatch {
  agency?: Partial<Settings['agency']>;
  pitch?: Partial<Settings['pitch']>;
  dataPolicy?: Partial<Settings['dataPolicy']>;
  demoMode?: boolean;
}

export function saveSettings(patch: SettingsPatch): Settings {
  const db = getDb();
  db.settings = {
    ...db.settings,
    ...patch,
    agency: { ...db.settings.agency, ...(patch.agency ?? {}) },
    pitch: { ...db.settings.pitch, ...(patch.pitch ?? {}) },
    dataPolicy: { ...db.settings.dataPolicy, ...(patch.dataPolicy ?? {}) },
    updatedAt: nowIso(),
  };
  commit();
  return db.settings;
}

export function listSuppression(): SuppressionEntry[] {
  return getDb().suppression;
}

export function addSuppression(entry: Omit<SuppressionEntry, 'id' | 'createdAt'>): SuppressionEntry {
  const db = getDb();
  const value = entry.value.trim().toLowerCase();
  const existing = db.suppression.find((s) => s.kind === entry.kind && s.value.toLowerCase() === value);
  if (existing) return existing;
  const created: SuppressionEntry = { id: newId('sup'), createdAt: nowIso(), kind: entry.kind, value, reason: entry.reason };
  db.suppression.unshift(created);
  commit();
  return created;
}

export function addSuppressionFromLead(lead: Lead, reason: string): void {
  const phone = lead.place.internationalPhoneNumber ?? lead.place.nationalPhoneNumber;
  if (phone) addSuppression({ kind: 'phone', value: phone.replace(/\D/g, ''), reason });
  if (lead.email) addSuppression({ kind: 'email', value: lead.email, reason });
  addSuppression({ kind: 'business', value: lead.place.displayName, reason });
}

export function removeSuppression(id: string): boolean {
  const db = getDb();
  const before = db.suppression.length;
  db.suppression = db.suppression.filter((s) => s.id !== id);
  const removed = db.suppression.length < before;
  if (removed) commit();
  return removed;
}

/** True when a lead's phone/email/domain is on the manual suppression list. */
export function isSuppressed(lead: Lead): boolean {
  const list = getDb().suppression;
  if (list.length === 0) return false;
  const phone = (lead.place.internationalPhoneNumber ?? lead.place.nationalPhoneNumber ?? '').replace(/\D/g, '');
  const email = (lead.email ?? '').toLowerCase();
  const domain = email.includes('@') ? email.split('@')[1] : '';
  const name = lead.place.displayName.toLowerCase();
  return list.some((entry) => {
    const value = entry.value.toLowerCase();
    switch (entry.kind) {
      case 'phone':
        return phone.length > 0 && (phone === value || phone.endsWith(value));
      case 'email':
        return email === value;
      case 'domain':
        return domain === value.replace(/^@/, '');
      case 'business':
        return name === value;
      default:
        return false;
    }
  });
}

export function recordSearch(query: SearchQueryRecord): void {
  const db = getDb();
  db.searches.unshift(query);
  db.searches = db.searches.slice(0, 100);
  commit();
}

export function listSearches(): SearchQueryRecord[] {
  return getDb().searches;
}

// ─────────────────────────── demo helpers ───────────────────────────

export function reseedDemoData(): { leads: number; campaigns: number } {
  const db = getDb();
  const demoLeads = db.leads.filter((l) => l.isDemo);
  const demoIds = new Set(demoLeads.map((l) => l.id));
  db.leads = db.leads.filter((l) => !demoIds.has(l.id));
  const { leads, campaign } = buildDemoLeads();
  db.leads = [...leads, ...db.leads];
  db.campaigns = db.campaigns.filter((c) => !c.name.startsWith('Demo ·'));
  db.campaigns.unshift(campaign);
  commit();
  return { leads: leads.length, campaigns: 1 };
}

export function clearDemoData(): number {
  const db = getDb();
  const before = db.leads.length;
  db.leads = db.leads.filter((l) => !l.isDemo);
  db.campaigns = db.campaigns.filter((c) => !c.name.startsWith('Demo ·'));
  const removed = before - db.leads.length;
  if (removed > 0) commit();
  return removed;
}

export function clearAllLeads(): number {
  const db = getDb();
  const before = db.leads.length;
  db.leads = [];
  commit();
  return before;
}
