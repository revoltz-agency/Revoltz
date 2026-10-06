/**
 * Lead search service — the single place that decides between Google Places
 * (New) Text Search and the offline demo dataset.
 *
 * Rules enforced here:
 *  • If no API key is configured we NEVER pretend to call Google. We return
 *    demo records plus an explicit notice.
 *  • Searching does not write anything: results come back as candidates and the
 *    user imports the ones they want (POST /api/leads/import).
 *  • Radius/coordinates are optional; a radius can only bias results when a
 *    centre point exists, and we say so instead of silently ignoring it.
 */

import type { Lead, PlaceSnapshot, SearchQueryRecord } from '../types';
import { getConfig } from '../config';
import { textSearch } from '../google/places';
import { DEMO_BUSINESSES, type DemoBusiness } from '../db/demo-data';
import { demoSnapshotFor, findLeadByPlaceId, filterDemoBusinesses, upsertLeadFromPlace } from '../db';
import { nowIso } from '../utils';
import type { SearchPayload } from '../validation';
import { computeOpportunityScore } from '../scoring/opportunity';

export interface SearchCandidate {
  place: PlaceSnapshot;
  /** Set when this place is already in the CRM (importing refreshes it). */
  existingLeadId: string | null;
  existingStatus: string | null;
  previewScore: number | null;
  previewBand: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  previewReason: string | null;
}

export interface LeadSearchResult {
  mode: 'live' | 'demo';
  candidates: SearchCandidate[];
  textQuery: string;
  locationBiasUsed: 'circle' | 'text-only';
  notices: string[];
  query: SearchQueryRecord;
  googleConfigured: boolean;
}

export async function runLeadSearch(payload: SearchPayload): Promise<LeadSearchResult> {
  const cfg = getConfig();
  const executedAt = nowIso();
  const maxResults = Math.max(1, Math.min(20, Math.round(payload.maxResults ?? 20)));

  const query: SearchQueryRecord = {
    industry: payload.industry,
    city: payload.city,
    radiusKm: payload.radiusKm ?? null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    maxResults,
    executedAt,
    mode: 'demo',
  };

  const useDemo = payload.demo === true || !cfg.googlePlaces.configured;

  if (useDemo) {
    query.mode = 'demo';
    const matches = filterDemoBusinesses(payload.industry, payload.city).slice(0, maxResults);
    const fallback = matches.length === 0;
    const rows: DemoBusiness[] = fallback ? DEMO_BUSINESSES.slice(0, maxResults) : matches;

    const notices: string[] = [
      cfg.googlePlaces.configured
        ? 'Demo Mode requested — no Google Places call was made.'
        : 'Google Places API not configured — Demo Mode active. Set GOOGLE_PLACES_API_KEY to search real Places data.',
    ];
    if (fallback) {
      notices.push(
        `No demo records match "${payload.industry}" near "${payload.city}". Showing the full demo dataset (${DEMO_BUSINESSES.length} fictional businesses) instead.`,
      );
    } else {
      notices.push(
        `${rows.length} of ${DEMO_BUSINESSES.length} fictional demo businesses matched. Names, addresses, phone numbers and websites are invented and cannot be contacted.`,
      );
    }
    if (payload.radiusKm && payload.radiusKm > 0) {
      notices.push('Radius is ignored in Demo Mode — the demo dataset is not geocoded.');
    }

    return {
      mode: 'demo',
      candidates: rows.map((business) => toCandidate(demoSnapshotFor(business, executedAt))),
      textQuery: `${payload.industry} in ${payload.city}`,
      locationBiasUsed: 'text-only',
      notices,
      query,
      googleConfigured: cfg.googlePlaces.configured,
    };
  }

  // ── Live Google Places (New) Text Search ──
  const result = await textSearch({
    industry: payload.industry,
    city: payload.city,
    maxResults,
    radiusKm: payload.radiusKm ?? null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
  });
  query.mode = 'live';

  const notices: string[] = [
    result.places.length > 0
      ? `Google Places API (New) returned ${result.places.length} place(s) for "${result.textQuery}".`
      : `Google returned no places for "${result.textQuery}". Try a broader category or a nearby locality.`,
  ];
  if (payload.radiusKm && payload.radiusKm > 0 && result.locationBiasUsed === 'text-only') {
    notices.push(
      'Radius was not applied: a radius needs a centre point. Enter coordinates or use "Use my location" to bias results by distance.',
    );
  }

  return {
    mode: 'live',
    candidates: result.places.map(toCandidate),
    textQuery: result.textQuery,
    locationBiasUsed: result.locationBiasUsed,
    notices,
    query,
    googleConfigured: true,
  };
}

function toCandidate(place: PlaceSnapshot): SearchCandidate {
  const existing = findLeadByPlaceId(place.placeId);
  const score = existing?.score ?? previewScoreFor(place);
  return {
    place,
    existingLeadId: existing?.id ?? null,
    existingStatus: existing?.status ?? null,
    previewScore: score?.score ?? null,
    previewBand: score?.band ?? null,
    previewReason: score?.reason ?? null,
  };
}

function previewScoreFor(place: PlaceSnapshot) {
  return computeOpportunityScore({ place, analysis: null });
}

export interface ImportPayload {
  candidates: { place: PlaceSnapshot }[];
  query: SearchQueryRecord | null;
  campaignId?: string | null;
  isDemo?: boolean;
}

export interface ImportResult {
  imported: Lead[];
  created: number;
  refreshed: number;
  notice: string;
}

/** Persists selected candidates (deduped by place_id) into the CRM. */
export function importCandidates(payload: ImportPayload): ImportResult {
  let created = 0;
  let refreshed = 0;
  const imported: Lead[] = [];

  for (const candidate of payload.candidates) {
    const result = upsertLeadFromPlace({
      place: candidate.place,
      query: payload.query,
      isDemo: payload.isDemo ?? candidate.place.source === 'demo',
      campaignId: payload.campaignId ?? null,
    });
    if (result.created) created += 1;
    else refreshed += 1;
    imported.push(result.lead);
  }

  return {
    imported,
    created,
    refreshed,
    notice:
      created + refreshed === 0
        ? 'Nothing to import.'
        : `${created} new lead(s) saved${refreshed ? ` and ${refreshed} existing record(s) refreshed from the new snapshot` : ''}. CRM notes, status and drafts were preserved on refresh.`,
  };
}
