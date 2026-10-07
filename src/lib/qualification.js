export const MAX_OBSERVABLE_RAW_SCORE = 70;

export function getWebsiteAudit(lead) {
  return lead?.websiteAudit || lead?.demoAudit || null;
}

export function scoreOpportunity(lead) {
  if (lead?.needsRefresh) {
    return {
      score: 0, rawScore: 0, maxRawScore: MAX_OBSERVABLE_RAW_SCORE, tier: 'low',
      signals: [
        { key: 'no-website', label: 'No website listed', points: 30, active: false },
        { key: 'weak-website', label: 'Website checks indicate multiple gaps', points: 20, active: false },
        { key: 'reviews', label: '100+ Google reviews', points: 15, active: false },
        { key: 'rating', label: 'Strong rating (4.5+)', points: 10, active: false },
        { key: 'active', label: 'Business status is operational', points: 10, active: false },
        { key: 'contact-flow', label: 'No obvious contact flow detected', points: 10, active: false },
        { key: 'social', label: 'Social profile link detected', points: 5, active: false },
      ],
    };
  }
  const manual = lead?.source === 'manual';
  const userProvidedRating = manual || lead?.manualUserFields?.includes('rating');
  const userProvidedReviews = manual || lead?.manualUserFields?.includes('reviews');
  const userProvidedSocial = manual || lead?.manualUserFields?.some((field) => ['instagram', 'facebook'].includes(field));
  const audit = getWebsiteAudit(lead);
  const hasSocial = Boolean(audit?.socialLinks?.length || ((manual || userProvidedSocial) && (lead.instagram || lead.facebook)));
  const signals = [
    {
      key: 'no-website',
      label: manual ? 'Website not provided (not assessed)' : lead.demo ? 'No website field in demo sample' : 'No website listed',
      points: 30,
      // A missing field in a manually entered record is unknown, not evidence of a website weakness.
      active: !manual && !lead.website,
    },
    { key: 'weak-website', label: lead.demo ? 'Illustrative website check shows multiple gaps' : 'Website checks indicate multiple gaps', points: 20, active: Boolean(lead.website && audit?.weakWebsite) },
    { key: 'reviews', label: manual && lead.reviews == null ? 'Review count not provided' : userProvidedReviews ? '100+ user-provided reviews' : lead.demo ? '100+ fictional sample reviews' : '100+ Google reviews', points: 15, active: Number(lead.reviews) >= 100 },
    { key: 'rating', label: manual && lead.rating == null ? 'Rating not provided' : userProvidedRating ? 'Strong user-provided rating (4.5+)' : 'Strong rating (4.5+)', points: 10, active: Number(lead.rating) >= 4.5 },
    { key: 'active', label: manual ? 'Business status not provided' : lead.demo ? 'Demo sample marked operational' : 'Business status is operational', points: 10, active: lead.businessStatus === 'OPERATIONAL' },
    { key: 'contact-flow', label: manual && !audit ? 'Contact flow not assessed' : lead.demo ? 'Illustrative contact flow not detected' : 'No obvious contact flow detected', points: 10, active: Boolean(lead.website && audit?.contactFlowDetected === false) },
    { key: 'social', label: manual ? hasSocial ? 'User-provided social profile link' : 'Social profiles not provided' : lead.demo ? 'Illustrative sample social link' : 'Social profile link detected', points: 5, active: hasSocial },
  ];
  const rawScore = signals.reduce((sum, signal) => sum + (signal.active ? signal.points : 0), 0);
  const score = Math.min(100, Math.round((rawScore / MAX_OBSERVABLE_RAW_SCORE) * 100));
  const tier = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
  return { score, rawScore, maxRawScore: MAX_OBSERVABLE_RAW_SCORE, tier, signals };
}

export function opportunityReason(lead) {
  if (lead?.needsRefresh) return 'Saved place ID only. Refresh current listing details before qualification or outreach.';
  if (lead?.source === 'manual') {
    if (!lead.website) return 'Website was not provided. This is unknown, not a confirmed website weakness; review the business details manually.';
    const { score, tier } = scoreOpportunity(lead);
    const reputation = [
      Number(lead.rating) > 0 ? `${Number(lead.rating).toFixed(1)} user-provided rating` : '',
      Number(lead.reviews) > 0 ? `${Number(lead.reviews).toLocaleString()} user-provided reviews` : '',
    ].filter(Boolean).join(' across ');
    const audit = getWebsiteAudit(lead);
    if (audit?.weakWebsite) {
      const issueCount = Number(audit.majorGapCount) || 2;
      return `A limited HTML check detected ${issueCount} potential website gaps. Review the findings manually before drawing conclusions or reaching out.`;
    }
    if (reputation) return `${reputation}. These details were entered manually and have not been independently verified.`;
    return `Manually entered details are not independently verified. Review the source information before qualifying this ${tier}-priority lead (score ${score}/100).`;
  }
  if (lead?.demo) {
    if (!lead.website) return 'This fictional demo record has no website field. Its score and service suggestion are illustrative, not a real-business assessment.';
    if (lead.demoAudit?.weakWebsite) return 'Illustrative demo website signals show possible HTML gaps. This is not a live audit or real-business assessment.';
    return 'Fictional demo details are included to exercise the workflow; verify real opportunities from official sources.';
  }
  const { score, tier } = scoreOpportunity(lead);
  const userProvidedRating = lead?.manualUserFields?.includes('rating');
  const userProvidedReviews = lead?.manualUserFields?.includes('reviews');
  const reputationHasManualFields = userProvidedRating || userProvidedReviews;
  const reviewText = Number.isFinite(Number(lead.reviews)) && Number(lead.reviews) > 0
    ? `${Number(lead.reviews).toLocaleString()} ${userProvidedReviews ? 'user-provided' : 'Google'} reviews`
    : '';
  const ratingText = Number.isFinite(Number(lead.rating)) && Number(lead.rating) > 0
    ? `${Number(lead.rating).toFixed(1)} ${userProvidedRating ? 'user-provided rating' : 'rating'}`
    : '';
  const reputation = [ratingText, reviewText].filter(Boolean).join(' across ');
  const audit = getWebsiteAudit(lead);

  if (!lead.website) {
    if (reputation) return `${reputationHasManualFields ? 'The available details include' : 'The Google listing shows'} ${reputation}, but no website is listed. A focused site with a clear enquiry path may be worth exploring.`;
    return 'No website is listed on the business profile. A simple, enquiry-focused web presence may be worth exploring.';
  }
  if (audit?.weakWebsite) {
    const issueCount = Number(audit.majorGapCount) || 2;
    return `${reputation ? `${reputationHasManualFields ? 'Available details include' : 'The listing shows'} ${reputation}; ` : ''}a limited HTML check detected ${issueCount} potential website conversion gaps. Review the findings before outreach.`;
  }
  if (reputation) return `The business has ${reputation}${lead.businessStatus === 'OPERATIONAL' ? ' and is marked operational' : ''}. Consider a tailored improvement pitch based on a human review of its website.`;
  if (lead.businessStatus === 'OPERATIONAL') return 'The listing is marked operational. Review the business website and contact options before deciding whether to reach out.';
  return `A ${tier}-priority lead based on the currently available listing details (score ${score}/100). Verify the opportunity before outreach.`;
}
