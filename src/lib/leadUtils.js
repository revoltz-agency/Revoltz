import { getWebsiteAudit } from './qualification.js';

export function dedupeLeads(leads = []) {
  const byId = new Map();
  for (const lead of leads) {
    const key = lead?.placeId || lead?.id;
    if (!key) continue;
    const previous = byId.get(key);
    if (!previous) {
      byId.set(key, lead);
      continue;
    }
    // Later responses may fill missing fields; never replace a known value with
    // an empty/default value, and preserve user/workflow-only metadata.
    const merged = { ...previous, ...lead };
    for (const field of ['name', 'category', 'address', 'city', 'phone', 'internationalPhoneNumber', 'website', 'mapsUrl', 'businessStatus']) {
      if (typeof lead[field] === 'string' && !lead[field].trim()) merged[field] = previous[field] ?? lead[field];
    }
    if (!Number.isFinite(Number(lead.rating)) || Number(lead.rating) <= 0) merged.rating = previous.rating ?? lead.rating;
    if (!Number.isFinite(Number(lead.reviews)) || Number(lead.reviews) <= 0) merged.reviews = previous.reviews ?? lead.reviews;
    if (lead.businessStatus === 'UNKNOWN' && previous.businessStatus && previous.businessStatus !== 'UNKNOWN') merged.businessStatus = previous.businessStatus;
    byId.set(key, merged);
  }
  return [...byId.values()];
}

export function whyThisLead(lead) {
  if (lead?.needsRefresh) return [{ key: 'refresh', text: 'Refresh this saved Google place to retrieve current details before qualification.', type: 'neutral' }];
  const reasons = [];
  const reviews = Number(lead.reviews);
  const rating = Number(lead.rating);
  const audit = getWebsiteAudit(lead);
  if (!lead.website) reasons.push({ key: 'website', text: lead.demo ? 'No website field is included in this fictional sample record.' : 'No website is listed in the Google business profile.', type: 'opportunity' });
  if (reviews >= 100) reasons.push({ key: 'reviews', text: lead.demo ? `Fictional sample data includes ${reviews.toLocaleString()} reviews.` : `${reviews.toLocaleString()} Google reviews`, type: 'positive' });
  if (rating >= 4.5) reasons.push({ key: 'rating', text: lead.demo ? `Fictional sample rating (${rating.toFixed(1)} / 5).` : `Strong local rating (${rating.toFixed(1)} / 5)`, type: 'positive' });
  if (lead.phone) reasons.push({ key: 'phone', text: lead.demo ? 'A phone number is included in this fictional sample.' : 'Public business phone is available in the listing.', type: 'positive' });
  else reasons.push({ key: 'phone-missing', text: lead.demo ? 'No phone number is included in this fictional sample.' : 'Phone was not returned in the Google listing.', type: 'neutral' });
  if (lead.businessStatus === 'OPERATIONAL') reasons.push({ key: 'active', text: lead.demo ? 'Fictional sample data marks this business operational.' : 'Google lists the business as operational.', type: 'positive' });
  if (audit?.ctaDetected === false) reasons.push({ key: 'cta', text: lead.demo ? 'Illustrative demo check did not detect an enquiry CTA.' : 'No obvious enquiry CTA detected in the limited HTML check.', type: 'opportunity' });
  if (audit?.contactFlowDetected === false) reasons.push({ key: 'contact', text: lead.demo ? 'Illustrative demo check did not detect a contact link.' : 'No obvious contact link detected in the limited HTML check.', type: 'opportunity' });
  if (isFoodBusiness(lead) && audit?.onlineOrderingDetected === false) reasons.push({ key: 'ordering', text: lead.demo ? 'Illustrative demo check did not detect an online-ordering link.' : 'No online-ordering link detected in the fetched page HTML.', type: 'opportunity' });
  if (!reasons.some((reason) => reason.type !== 'neutral')) {
    reasons.push({ key: 'verify', text: lead.demo ? 'Fictional sample signals are illustrative, not a real-business assessment.' : 'Not enough verified signals yet; review the profile manually.', type: 'neutral' });
  }
  return reasons;
}

export function isFoodBusiness(lead) {
  return /restaurant|cafe|café|cloud kitchen|food|takeaway|bakery/i.test(`${lead.category || ''} ${lead.name || ''}`);
}

export function recommendService(lead) {
  if (lead?.needsRefresh) return [{ service: 'Manual review', reason: 'Refresh current Google details before making a service recommendation.' }];
  const audit = getWebsiteAudit(lead);
  const suggestions = [];
  if (lead.demo) {
    if (!lead.website) {
      suggestions.push({ service: 'Website', reason: 'Fictional demo record has no website field; this is an illustrative suggestion only.' });
      suggestions.push({ service: 'Lead capture', reason: 'Illustrative demo suggestion based on the sample having no website field.' });
      return suggestions;
    }
    if (audit?.weakWebsite) return [{ service: 'Website', reason: 'Illustrative demo signals show multiple HTML gaps; this is not a live assessment.' }];
    return [{ service: 'Manual review', reason: 'Fictional demo signals are illustrative only; no real-business service gap is verified.' }];
  }
  if (!lead.website) {
    suggestions.push({ service: 'Website', reason: 'No website is listed in the returned Google profile.' });
    suggestions.push({ service: 'Lead capture', reason: 'A website is not listed, so a dedicated enquiry path could be explored.' });
    return suggestions;
  }
  if (audit?.weakWebsite) suggestions.push({ service: 'Website', reason: 'Multiple expected page signals were not detected in the limited HTML check; review the site manually before proposing improvements.' });
  if (audit?.ctaDetected === false || audit?.contactFlowDetected === false) {
    suggestions.push({ service: 'Lead capture', reason: 'A clear enquiry CTA or contact path was not detected in fetched HTML.' });
  }
  if (isFoodBusiness(lead) && audit?.onlineOrderingDetected === false) {
    suggestions.push({ service: 'Website', reason: 'No online-ordering link was detected in the fetched HTML; verify manually.' });
  }
  if (!suggestions.length) return [{ service: 'Manual review', reason: 'No specific service gap was detected from the available evidence.' }];
  return suggestions;
}

export function savedLeadPlaceholder(placeId) {
  return {
    id: placeId,
    placeId,
    source: 'google',
    name: 'Saved business — refresh listing details',
    category: 'Saved place ID',
    city: '',
    address: '',
    phone: '',
    internationalPhoneNumber: '',
    website: '',
    rating: null,
    reviews: 0,
    mapsUrl: '',
    businessStatus: 'UNKNOWN',
    needsRefresh: true,
  };
}
