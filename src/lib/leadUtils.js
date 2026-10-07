import { isOsmLead, listingSourceNoun } from './freeLeadFinder.js';
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

function manualReasons(lead) {
  const reasons = [];
  const reviews = Number(lead.reviews);
  const rating = Number(lead.rating);
  const audit = getWebsiteAudit(lead);
  if (!lead.website) reasons.push({ key: 'website-not-provided', text: 'Website: Not provided. No website assessment was made.', type: 'neutral' });
  if (lead.reviews != null) reasons.push({ key: 'reviews', text: `${reviews.toLocaleString()} review${reviews === 1 ? '' : 's'} were entered manually; verify the count before relying on it.`, type: reviews >= 100 ? 'positive' : 'neutral' });
  else reasons.push({ key: 'reviews-not-provided', text: 'Review count: Not provided.', type: 'neutral' });
  if (lead.rating != null) reasons.push({ key: 'rating', text: `A ${rating.toFixed(1)} rating was entered manually; verify its source before relying on it.`, type: rating >= 4.5 ? 'positive' : 'neutral' });
  else reasons.push({ key: 'rating-not-provided', text: 'Rating: Not provided.', type: 'neutral' });
  if (lead.phone) reasons.push({ key: 'phone', text: 'A phone number was entered manually; confirm it belongs to the business before use.', type: 'positive' });
  else reasons.push({ key: 'phone-not-provided', text: 'Phone: Not provided.', type: 'neutral' });
  if (lead.instagram || lead.facebook) reasons.push({ key: 'social', text: 'A social profile link was entered manually; verify the profile belongs to the business.', type: 'positive' });
  else reasons.push({ key: 'social-not-provided', text: 'Social profile links: Not provided.', type: 'neutral' });
  if (!lead.businessStatus || lead.businessStatus === 'UNKNOWN') reasons.push({ key: 'business-status-not-provided', text: 'Business status: Not provided.', type: 'neutral' });
  if (audit?.weakWebsite) reasons.push({ key: 'weak-website', text: 'A limited website check found possible gaps. Review the raw findings; missing details are not proof of a business weakness.', type: 'opportunity' });
  if (!reasons.some((reason) => reason.type !== 'neutral')) {
    reasons.push({ key: 'verify', text: 'No independently verified qualification signals yet; review the supplied details manually.', type: 'neutral' });
  }
  return reasons;
}

export function whyThisLead(lead) {
  if (lead?.needsRefresh) return [{ key: 'refresh', text: 'Refresh this saved Google place to retrieve current details before qualification or outreach.', type: 'neutral' }];
  if (lead?.source === 'manual') return manualReasons(lead);
  const reasons = [];
  const reviews = Number(lead.reviews);
  const rating = Number(lead.rating);
  const audit = getWebsiteAudit(lead);
  if (!lead.website) reasons.push({ key: 'website', text: lead.demo ? 'No website field is included in this fictional sample record.' : `No website is listed in the ${listingSourceNoun(lead)} business record.`, type: 'opportunity' });
  if (reviews >= 100) reasons.push({ key: 'reviews', text: lead.demo ? `Fictional sample data includes ${reviews.toLocaleString()} reviews.` : lead.manualUserFields?.includes('reviews') ? `${reviews.toLocaleString()} reviews were entered manually; verify the count before relying on it.` : `${reviews.toLocaleString()} Google reviews`, type: 'positive' });
  if (rating >= 4.5) reasons.push({ key: 'rating', text: lead.demo ? `Fictional sample rating (${rating.toFixed(1)} / 5).` : lead.manualUserFields?.includes('rating') ? `A ${rating.toFixed(1)} rating was entered manually; verify its source before relying on it.` : `Strong local rating (${rating.toFixed(1)} / 5)`, type: 'positive' });
  if (lead.phone) reasons.push({ key: 'phone', text: lead.demo ? 'A phone number is included in this fictional sample.' : lead.manualUserFields?.includes('phone') ? 'A phone number was entered manually; confirm it belongs to the business before use.' : 'Public business phone is available in the listing.', type: 'positive' });
  if (!lead.phone) reasons.push({ key: 'phone-missing', text: lead.demo ? 'No phone number is included in this fictional sample.' : `Phone was not returned in the ${listingSourceNoun(lead)} listing.`, type: 'neutral' });
  // OpenStreetMap carries no reputation or operational-status fields; say so
  // instead of letting the absence look like a scored weakness.
  if (isOsmLead(lead)) reasons.push({ key: 'osm-no-reputation', text: 'OpenStreetMap does not provide ratings, review counts, or business status, so those signals are absent rather than poor.', type: 'neutral' });
  if ((lead.instagram || lead.facebook) && lead.manualUserFields?.some((field) => ['instagram', 'facebook'].includes(field))) reasons.push({ key: 'social-manual', text: 'A social profile link was entered manually; verify the profile belongs to the business.', type: 'positive' });
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
  if (lead?.source === 'manual' && !lead.website) {
    return [{ service: 'Manual review', reason: 'Website was not provided, so a website need has not been established. Verify the supplied details before recommending a service.' }];
  }
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
    suggestions.push({ service: 'Website', reason: `No website is listed in the returned ${listingSourceNoun(lead)} profile.` });
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
