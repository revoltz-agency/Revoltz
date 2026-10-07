import { getWebsiteAudit } from './qualification.js';

function verifiedObservation(lead) {
  if (!lead.website) {
    return lead.source === 'manual'
      ? 'A website was not provided with the lead details, so I have not assessed one.'
      : 'I noticed your Google business listing does not include a website.';
  }

  const audit = getWebsiteAudit(lead);
  if (audit && !lead.demo) {
    if (audit.ctaDetected === false && audit.contactFlowDetected === false) {
      return 'A limited check of the public page HTML did not detect an obvious enquiry call-to-action or contact link; dynamic content may not have been visible to the check.';
    }
    if (audit.mobileViewportDetected === false) {
      return 'A limited check of the public page HTML did not detect a mobile viewport declaration; the check does not assess the visual design.';
    }
  }
  if (Number(lead.rating) > 0 && Number(lead.reviews) > 0) {
    if (lead.source === 'manual') return `The details I received list a ${Number(lead.rating).toFixed(1)} rating across ${Number(lead.reviews).toLocaleString()} reviews.`;
    if (lead.manualUserFields?.includes('rating') || lead.manualUserFields?.includes('reviews')) {
      const rating = `${Number(lead.rating).toFixed(1)} ${lead.manualUserFields?.includes('rating') ? 'user-provided rating' : 'rating'}`;
      const reviews = `${Number(lead.reviews).toLocaleString()} ${lead.manualUserFields?.includes('reviews') ? 'user-provided reviews' : 'Google reviews'}`;
      return `The supplied details list a ${rating} across ${reviews}.`;
    }
    return `Your Google listing shows a ${Number(lead.rating).toFixed(1)} rating across ${Number(lead.reviews).toLocaleString()} reviews.`;
  }
  return '';
}

export function buildOutreach(lead) {
  const business = lead.name || 'your business';
  const category = lead.category || 'local businesses';
  const city = lead.city || 'your area';
  const observation = verifiedObservation(lead);
  const intro = `I came across ${business} while researching ${category.toLowerCase()} businesses in ${city}.`;
  const specific = observation ? ` ${observation}` : '';
  const offer = `I run an AI and web agency that helps local businesses improve their online presence and make enquiries easier. I have a quick idea tailored to the public details above and would be happy to share a short demo. Would you be open to seeing it?`;

  return {
    subject: `A quick idea for ${business}`,
    emailBody: `Hi ${business},\n\n${intro}${specific}\n\n${offer}\n\nBest,\n[Your name]`,
    whatsappBody: `Hi ${business} — I came across your ${category.toLowerCase()} in ${city}.${observation ? ` ${observation}` : ''} I run an AI and web agency and had a small idea that may help make enquiries easier. Would you be open to a short demo?`,
  };
}
