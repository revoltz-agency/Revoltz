/**
 * Builds the Demo Mode dataset (fictional businesses only).
 */

import type { Campaign, Lead, LeadStatus, PlaceSnapshot, SearchQueryRecord } from '../types';
import { addDays, newId, nowIso } from '../utils';
import { DEMO_BUSINESSES, DEMO_CITY, type DemoBusiness } from './demo-data';
import { computeOpportunityScore } from '../scoring/opportunity';
import { makeCampaign } from './defaults';

export function demoSnapshotFor(business: DemoBusiness, executedAt: string): PlaceSnapshot {
  return {
    placeId: `DEMO_${business.id.toUpperCase()}`,
    displayName: business.name,
    formattedAddress: business.address,
    nationalPhoneNumber: business.phone.replace(/^\+91\s*/, ''),
    internationalPhoneNumber: business.phone.replace(/\s/g, ''),
    websiteUri: business.website,
    rating: business.rating,
    userRatingCount: business.reviews,
    googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${business.name} ${business.address}`,
    )}`,
    primaryType: business.primaryType,
    types: business.types,
    businessStatus: business.businessStatus,
    openNow: business.openNow,
    priceLevel: business.priceLevel,
    retrievedAt: executedAt,
    source: 'demo',
  };
}

/**
 * A couple of demo leads are seeded further down the pipeline so that the
 * dashboard, campaigns and follow-up views have something meaningful to show.
 * They remain clearly flagged as demo records.
 */
const DEMO_PIPELINE: Record<string, { status: LeadStatus; contactedDaysAgo?: number; service?: boolean }> = {
  demo_01: { status: 'CONTACTED', contactedDaysAgo: 4, service: true },
  demo_07: { status: 'REPLIED', contactedDaysAgo: 2, service: true },
  demo_04: { status: 'CALL_BOOKED', contactedDaysAgo: 6, service: true },
  demo_12: { status: 'RESEARCHED' },
  demo_06: { status: 'WON', contactedDaysAgo: 21, service: true },
  demo_08: { status: 'NEW' },
};

export function buildDemoLeads(): { leads: Lead[]; campaign: Campaign } {
  const executedAt = nowIso();
  const campaign = makeCampaign({
    name: `Demo · ${DEMO_CITY} local businesses`,
    description: 'Sample campaign created with the demo dataset. Manual send only.',
    service: 'WEBSITE',
  });
  campaign.status = 'active';

  const leads: Lead[] = DEMO_BUSINESSES.map((business, index) => {
    const place = demoSnapshotFor(business, executedAt);
    const pipeline = DEMO_PIPELINE[business.id];
    const createdAt = addDays(executedAt, -(14 - index)).toISOString();
    const lastContactedAt =
      pipeline?.contactedDaysAgo !== undefined ? addDays(executedAt, -pipeline.contactedDaysAgo).toISOString() : null;
    const status: LeadStatus = pipeline?.status ?? 'NEW';

    const lead: Lead = {
      id: newId('lead'),
      createdAt,
      updatedAt: lastContactedAt ?? createdAt,
      place,
      query: {
        industry: business.industryKeywords[0] ?? business.primaryType,
        city: DEMO_CITY,
        radiusKm: null,
        latitude: null,
        longitude: null,
        maxResults: 20,
        executedAt: createdAt,
        mode: 'demo',
      } as SearchQueryRecord,
      email: business.email ?? null,
      emailSource: business.email ? 'demo' : null,
      score: computeOpportunityScore({ place, analysis: null }),
      analysis: null,
      outreach: null,
      status,
      statusHistory: [
        { status: 'NEW', at: createdAt },
        ...(status !== 'NEW' ? [{ status, at: lastContactedAt ?? createdAt }] : []),
      ],
      crm: {
        notes: status === 'WON' ? 'Demo record — closed a chatbot + website package.' : '',
        lastContactedAt,
        nextFollowUpAt: lastContactedAt ? addDays(lastContactedAt, 3).toISOString().slice(0, 10) : null,
        assignedService: pipeline?.service ? business.suggestedService : null,
        estimatedDealValue: pipeline?.service ? 45_000 : null,
        currency: 'INR',
        owner: null,
      },
      campaignId: pipeline ? campaign.id : null,
      tags: business.tags ? [...business.tags, 'demo'] : ['demo'],
      isDemo: true,
    };
    return lead;
  });

  campaign.status = 'active';
  return { leads, campaign };
}

/** Filter the demo dataset by an industry/city text query (fuzzy, offline). */
export function filterDemoBusinesses(industry: string, city: string): DemoBusiness[] {
  const q = industry.trim().toLowerCase();
  const cityQ = city.trim().toLowerCase();
  return DEMO_BUSINESSES.filter((b) => {
    const cityMatch = !cityQ || cityQ === 'any' || b.address.toLowerCase().includes(cityQ) || DEMO_CITY.toLowerCase() === cityQ;
    if (!q) return cityMatch;
    const haystack = [b.name, b.primaryType, ...b.types, ...b.industryKeywords].join(' ').toLowerCase();
    // token match so "dental clinics" matches "dental clinic" / "dentist"
    const tokens = q.split(/[\s,/&]+/).filter((t) => t.length > 2 && t !== 'in' && t !== 'the');
    const tokenMatch = tokens.length === 0 || tokens.some((t) => haystack.includes(t) || t.includes(b.primaryType));
    return cityMatch && tokenMatch;
  });
}
