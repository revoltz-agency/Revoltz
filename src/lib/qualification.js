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
  const audit = getWebsiteAudit(lead);
  const signals = [
    { key: 'no-website', label: lead.demo ? 'No website field in demo sample' : 'No website listed', points: 30, active: !lead.website },
    { key: 'weak-website', label: lead.demo ? 'Illustrative website check shows multiple gaps' : 'Website checks indicate multiple gaps', points: 20, active: Boolean(lead.website && audit?.weakWebsite) },
    { key: 'reviews', label: lead.demo ? '100+ fictional sample reviews' : '100+ Google reviews', points: 15, active: Number(lead.reviews) >= 100 },
    { key: 'rating', label: 'Strong rating (4.5+)', points: 10, active: Number(lead.rating) >= 4.5 },
    { key: 'active', label: lead.demo ? 'Demo sample marked operational' : 'Business status is operational', points: 10, active: lead.businessStatus === 'OPERATIONAL' },
    { key: 'contact-flow', label: lead.demo ? 'Illustrative contact flow not detected' : 'No obvious contact flow detected', points: 10, active: Boolean(lead.website && audit?.contactFlowDetected === false) },
    { key: 'social', label: lead.demo ? 'Illustrative sample social link' : 'Social profile link detected', points: 5, active: Boolean(audit?.socialLinks?.length) },
  ];
  const rawScore = signals.reduce((sum, signal) => sum + (signal.active ? signal.points : 0), 0);
  const score = Math.min(100, Math.round((rawScore / MAX_OBSERVABLE_RAW_SCORE) * 100));
  const tier = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
  return { score, rawScore, maxRawScore: MAX_OBSERVABLE_RAW_SCORE, tier, signals };
}

export function opportunityReason(lead) {
  if (lead?.needsRefresh) return 'Saved place ID only. Refresh current listing details before qualification or outreach.';
  if (lead?.demo) {
    if (!lead.website) return 'This fictional demo record has no website field. Its score and service suggestion are illustrative, not a real-business assessment.';
    if (lead.demoAudit?.weakWebsite) return 'Illustrative demo website signals show possible HTML gaps. This is not a live audit or real-business assessment.';
    return 'Fictional demo details are included to exercise the workflow; verify real opportunities from official sources.';
  }
  const { score, tier } = scoreOpportunity(lead);
  const reviewText = Number.isFinite(Number(lead.reviews)) && Number(lead.reviews) > 0
    ? `${Number(lead.reviews).toLocaleString()} Google reviews`
    : '';
  const ratingText = Number.isFinite(Number(lead.rating)) && Number(lead.rating) > 0
    ? `${Number(lead.rating).toFixed(1)} rating`
    : '';
  const reputation = [ratingText, reviewText].filter(Boolean).join(' across ');
  const audit = getWebsiteAudit(lead);

  if (!lead.website) {
    if (reputation) return `The Google listing shows ${reputation}, but no website is listed. A focused site with a clear enquiry path may be worth exploring.`;
    return 'No website is listed on the business profile. A simple, enquiry-focused web presence may be worth exploring.';
  }
  if (audit?.weakWebsite) {
    const issueCount = Number(audit.majorGapCount) || 2;
    return `${reputation ? `The listing shows ${reputation}; ` : ''}a limited HTML check detected ${issueCount} potential website conversion gaps. Review the findings before outreach.`;
  }
  if (reputation) return `The business has ${reputation}${lead.businessStatus === 'OPERATIONAL' ? ' and is marked operational' : ''}. Consider a tailored improvement pitch based on a human review of its website.`;
  if (lead.businessStatus === 'OPERATIONAL') return 'The listing is marked operational. Review the business website and contact options before deciding whether to reach out.';
  return `A ${tier}-priority lead based on the currently available listing details (score ${score}/100). Verify the opportunity before outreach.`;
}
