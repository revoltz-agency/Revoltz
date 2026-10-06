/**
 * Google Places API (New) client — server-side only.
 *
 * Compliance notes:
 *  • Only official endpoints are used (`places:searchText`, `places/{id}`).
 *    No Google Maps webpage is ever scraped.
 *  • The API key lives in `process.env` and is never serialised to the client.
 *  • Field masks list only the fields this app renders — no wildcards.
 *  • Returned place data is stored as a timestamped snapshot; `place_id` is the
 *    durable identifier and snapshots are refreshed (or purged) when stale.
 */

import type { PlaceSnapshot } from '../types';
import { getConfig } from '../config';
import { clamp, nowIso } from '../utils';

/** Official endpoint. `GOOGLE_PLACES_BASE_URL` exists for corporate egress proxies and tests only. */
function placesBase(): string {
  return getConfig().googlePlaces.baseUrl;
}

/** Only what the UI needs — avoids paying for higher-cost field SKUs. */
export const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.types',
  'places.businessStatus',
  'places.currentOpeningHours.openNow',
  'places.priceLevel',
  'nextPageToken',
].join(',');

export const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
  'googleMapsUri',
  'primaryType',
  'primaryTypeDisplayName',
  'types',
  'businessStatus',
  'currentOpeningHours.openNow',
  'priceLevel',
].join(',');

export class PlacesApiError extends Error {
  status: number;
  code: string;
  hint?: string;

  constructor(message: string, status: number, code: string, hint?: string) {
    super(message);
    this.name = 'PlacesApiError';
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

interface SearchResponse {
  places?: RawPlace[];
  nextPageToken?: string;
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean };
  priceLevel?: string;
}

export function mapPlace(raw: RawPlace, fallbackId = ''): PlaceSnapshot {
  return {
    placeId: raw.id ?? fallbackId,
    displayName: raw.displayName?.text?.trim() ?? 'Unknown business',
    formattedAddress: raw.formattedAddress ?? null,
    nationalPhoneNumber: raw.nationalPhoneNumber ?? null,
    internationalPhoneNumber: raw.internationalPhoneNumber ?? null,
    websiteUri: raw.websiteUri ?? null,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    userRatingCount: typeof raw.userRatingCount === 'number' ? raw.userRatingCount : null,
    googleMapsUri: raw.googleMapsUri ?? null,
    primaryType: raw.primaryTypeDisplayName?.text ?? raw.primaryType ?? null,
    types: raw.types ?? [],
    businessStatus: raw.businessStatus ?? null,
    openNow: typeof raw.currentOpeningHours?.openNow === 'boolean' ? raw.currentOpeningHours.openNow : null,
    priceLevel: raw.priceLevel ?? null,
    retrievedAt: nowIso(),
    source: 'google_places',
  };
}

export interface TextSearchInput {
  industry: string;
  city: string;
  maxResults?: number;
  radiusKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  pageToken?: string | null;
}

export interface TextSearchResult {
  places: PlaceSnapshot[];
  nextPageToken: string | null;
  textQuery: string;
  locationBiasUsed: 'circle' | 'text-only';
}

function buildTextQuery(industry: string, city: string): string {
  const i = industry.trim();
  const c = city.trim();
  if (i && c) return `${i} in ${c}`;
  return i || c;
}

function describeError(status: number, body: unknown): PlacesApiError {
  const payload = body as { error?: { message?: string; status?: string; code?: number } } | undefined;
  const message = payload?.error?.message ?? `Google Places API request failed (HTTP ${status})`;
  const code = payload?.error?.status ?? 'UNKNOWN';

  let hint: string | undefined;
  if (status === 400) hint = 'Check the search text, radius and coordinates.';
  if (status === 403) {
    hint =
      'Key rejected or "Places API (New)" is not enabled. In Google Cloud Console enable Places API (New), then check key restrictions and billing.';
  }
  if (status === 429) hint = 'Quota/rate limit hit — retry later or lower "maximum results".';
  if (status >= 500) hint = 'Google-side error — retry.';

  return new PlacesApiError(message, status, code, hint);
}

/** Text Search (New) — https://developers.google.com/maps/documentation/places/web-service/text-search */
export async function textSearch(input: TextSearchInput): Promise<TextSearchResult> {
  const cfg = getConfig();
  if (!cfg.googlePlaces.apiKey) {
    throw new PlacesApiError(
      'Google Places API is not configured on this server.',
      503,
      'NOT_CONFIGURED',
      'Set GOOGLE_PLACES_API_KEY in .env.local, or keep using Demo Mode.',
    );
  }

  const textQuery = buildTextQuery(input.industry, input.city);
  const maxResultCount = clamp(Math.round(input.maxResults ?? 20), 1, 20);

  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount,
    languageCode: cfg.googlePlaces.languageCode,
    regionCode: cfg.googlePlaces.regionCode,
  };

  // A radius can only bias results when we also have a centre point.
  let locationBiasUsed: TextSearchResult['locationBiasUsed'] = 'text-only';
  const lat = input.latitude;
  const lng = input.longitude;
  if (input.radiusKm && typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: clamp(Math.round(input.radiusKm * 1000), 100, 50_000),
      },
    };
    locationBiasUsed = 'circle';
  }
  if (input.pageToken) body.pageToken = input.pageToken;

  const res = await fetch(`${placesBase()}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': cfg.googlePlaces.apiKey,
      'X-Goog-FieldMask': SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
    // Hard timeout so a stalled Google call can never hang a request.
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });

  const text = await res.text();
  let parsed: SearchResponse | null = null;
  try {
    parsed = text ? (JSON.parse(text) as SearchResponse) : null;
  } catch {
    throw describeError(res.status, { error: { message: `Unparseable response from Google (HTTP ${res.status})` } });
  }

  if (!res.ok) throw describeError(res.status, parsed);

  const places = (parsed?.places ?? []).map((raw) => mapPlace(raw));
  return { places, nextPageToken: parsed?.nextPageToken ?? null, textQuery, locationBiasUsed };
}

/** Place Details (New) — used to refresh a stored snapshot by place_id. */
export async function getPlaceDetails(placeId: string): Promise<PlaceSnapshot> {
  const cfg = getConfig();
  if (!cfg.googlePlaces.apiKey) {
    throw new PlacesApiError('Google Places API is not configured on this server.', 503, 'NOT_CONFIGURED');
  }
  const res = await fetch(`${placesBase()}/places/${encodeURIComponent(placeId)}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': cfg.googlePlaces.apiKey,
      'X-Goog-FieldMask': DETAILS_FIELD_MASK,
    },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  const text = await res.text();
  let parsed: RawPlace | null = null;
  try {
    parsed = text ? (JSON.parse(text) as RawPlace) : null;
  } catch {
    throw describeError(res.status, { error: { message: `Unparseable response from Google (HTTP ${res.status})` } });
  }
  if (!res.ok) throw describeError(res.status, parsed);
  return mapPlace(parsed ?? {}, placeId);
}
