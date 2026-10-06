/**
 * Opportunity Score — deterministic, evidence-first qualification model.
 *
 * Rules (V1 brief):
 *   No website ......................... +30
 *   Poor / weak website ................ +20
 *   High number of reviews ............. +15
 *   Strong rating ...................... +10
 *   Active-looking business ............ +10
 *   Missing enquiry / contact flow ..... +10
 *   Social presence .................... +5
 *                                    Total = 100
 *
 * Two hard constraints drive the implementation:
 *  1. A factor is only scored when the underlying data was actually retrieved.
 *     Otherwise it is reported as `unknown` (0 points) with an honest evidence
 *     string — we never guess or fabricate a signal.
 *  2. `dataCoverage` exposes how much of the model could be evaluated, so the
 *     UI can warn the user when a score is based on partial information.
 */

import type { OpportunityScore, PlaceSnapshot, ScoreBand, ScoreFactor, WebsiteAnalysis } from '../types';
import { clamp, formatNumber } from '../utils';

export const SCORE_THRESHOLDS = {
  reviewVolume: { high: 400, solid: 150, moderate: 60 },
  rating: { strong: 4.3, good: 4.0 },
  highPriorityBand: 80,
  mediumBand: 50,
} as const;

export function bandForScore(score: number): ScoreBand {
  if (score >= SCORE_THRESHOLDS.highPriorityBand) return 'HIGH';
  if (score >= SCORE_THRESHOLDS.mediumBand) return 'MEDIUM';
  return 'LOW';
}

export const BAND_META: Record<ScoreBand, { label: string; emoji: string; range: string }> = {
  HIGH: { label: 'High Priority', emoji: '🔥', range: '80–100' },
  MEDIUM: { label: 'Medium', emoji: '🟡', range: '50–79' },
  LOW: { label: 'Low', emoji: '⚪', range: '0–49' },
};

interface ScoreInput {
  place: PlaceSnapshot;
  analysis?: WebsiteAnalysis | null;
}

function reviewFactor(count: number | null): ScoreFactor {
  const base: Omit<ScoreFactor, 'awarded' | 'state' | 'evidence'> = {
    key: 'review_volume',
    label: 'High number of reviews',
    maxPoints: 15,
  };
  if (count === null || count === undefined) {
    return {
      ...base,
      awarded: 0,
      state: 'unknown',
      evidence: 'Review count was not returned by the Places API for this place.',
    };
  }
  const { high, solid, moderate } = SCORE_THRESHOLDS.reviewVolume;
  if (count >= high) {
    return {
      ...base,
      awarded: 15,
      state: 'awarded',
      evidence: `${formatNumber(count)} reviews on Google — very strong local demand signal.`,
    };
  }
  if (count >= solid) {
    return {
      ...base,
      awarded: 12,
      state: 'awarded',
      evidence: `${formatNumber(count)} reviews on Google — solid local traction.`,
    };
  }
  if (count >= moderate) {
    return {
      ...base,
      awarded: 7,
      state: 'awarded',
      evidence: `${formatNumber(count)} reviews on Google — moderate traction.`,
    };
  }
  return {
    ...base,
    awarded: 0,
    state: 'not-met',
    evidence: `Only ${formatNumber(count)} reviews — below the ${moderate}+ threshold.`,
  };
}

function ratingFactor(rating: number | null): ScoreFactor {
  const base: Omit<ScoreFactor, 'awarded' | 'state' | 'evidence'> = {
    key: 'strong_rating',
    label: 'Strong rating',
    maxPoints: 10,
  };
  if (rating === null || rating === undefined) {
    return {
      ...base,
      awarded: 0,
      state: 'unknown',
      evidence: 'No rating was returned for this place.',
    };
  }
  if (rating >= SCORE_THRESHOLDS.rating.strong) {
    return {
      ...base,
      awarded: 10,
      state: 'awarded',
      evidence: `${rating.toFixed(1)}★ rating — a quality business worth protecting/ scaling online.`,
    };
  }
  if (rating >= SCORE_THRESHOLDS.rating.good) {
    return {
      ...base,
      awarded: 6,
      state: 'awarded',
      evidence: `${rating.toFixed(1)}★ rating — respectable, with room to improve.`,
    };
  }
  return {
    ...base,
    awarded: 0,
    state: 'not-met',
    evidence: `${rating.toFixed(1)}★ rating — below the ${SCORE_THRESHOLDS.rating.good}+ threshold.`,
  };
}

function activeFactor(place: PlaceSnapshot): ScoreFactor {
  const base: Omit<ScoreFactor, 'awarded' | 'state' | 'evidence'> = {
    key: 'active_business',
    label: 'Active-looking business',
    maxPoints: 10,
  };
  const status = (place.businessStatus ?? '').toUpperCase();
  if (status === 'CLOSED_PERMANENTLY') {
    return {
      ...base,
      awarded: 0,
      state: 'not-met',
      evidence: 'Google reports the business as permanently closed.',
    };
  }
  if (status === 'CLOSED_TEMPORARILY') {
    return {
      ...base,
      awarded: 0,
      state: 'not-met',
      evidence: 'Google reports the business as temporarily closed.',
    };
  }
  if (status === 'OPERATIONAL') {
    if (place.openNow === true) {
      return {
        ...base,
        awarded: 10,
        state: 'awarded',
        evidence: 'Business status is OPERATIONAL and open right now per Google opening hours.',
      };
    }
    if (place.openNow === false) {
      return {
        ...base,
        awarded: 8,
        state: 'awarded',
        evidence: 'Business status is OPERATIONAL (currently outside opening hours).',
      };
    }
    return {
      ...base,
      awarded: 8,
      state: 'awarded',
      evidence: 'Business status is OPERATIONAL (opening hours not returned).',
    };
  }
  return {
    ...base,
    awarded: 0,
    state: 'unknown',
    evidence: 'Business status was not returned — activity could not be verified.',
  };
}

function enquiryFlowFactor(place: PlaceSnapshot, analysis: WebsiteAnalysis | null): ScoreFactor {
  const base: Omit<ScoreFactor, 'awarded' | 'state' | 'evidence'> = {
    key: 'missing_enquiry_flow',
    label: 'Missing enquiry / contact flow',
    maxPoints: 10,
  };
  if (!place.websiteUri) {
    return {
      ...base,
      awarded: 10,
      state: 'awarded',
      evidence: 'No website, therefore no on-site enquiry form or click-to-chat flow exists.',
    };
  }
  if (!analysis || !analysis.fetched) {
    return {
      ...base,
      awarded: 0,
      state: 'unknown',
      evidence:
        analysis && !analysis.fetched && analysis.skippedReason
          ? `Website not inspected (${analysis.skippedReason}).`
          : 'Website present but not analysed yet — run "Analyze Website" to verify.',
    };
  }
  const missingContact = analysis.findings.missingContactFlow === 'fail';
  const missingWhatsapp = analysis.findings.missingWhatsappFlow === 'fail';
  if (missingContact && missingWhatsapp) {
    return {
      ...base,
      awarded: 10,
      state: 'awarded',
      evidence: 'No enquiry form and no WhatsApp click-to-chat link found in the site HTML.',
    };
  }
  if (missingContact || missingWhatsapp) {
    return {
      ...base,
      awarded: 5,
      state: 'awarded',
      evidence: missingContact
        ? 'No enquiry form detected in the site HTML (WhatsApp link present).'
        : 'Enquiry form present but no WhatsApp click-to-chat link detected.',
    };
  }
  return {
    ...base,
    awarded: 0,
    state: 'not-met',
    evidence: 'Enquiry form and WhatsApp click-to-chat link both detected in the site HTML.',
  };
}

function socialFactor(analysis: WebsiteAnalysis | null, place: PlaceSnapshot): ScoreFactor {
  const base: Omit<ScoreFactor, 'awarded' | 'state' | 'evidence'> = {
    key: 'social_presence',
    label: 'Social presence (marketing intent)',
    maxPoints: 5,
  };
  if (!analysis) {
    return {
      ...base,
      awarded: 0,
      state: 'unknown',
      evidence: place.websiteUri
        ? 'Social links can only be verified by analysing the website.'
        : 'No website to inspect, so social presence was not retrieved (Google Places does not return social profiles).',
    };
  }
  const links = analysis.socialLinks ?? [];
  if (links.length > 0) {
    return {
      ...base,
      awarded: 5,
      state: 'awarded',
      evidence: `Social profile(s) linked from the site: ${links.map((l) => l.platform).join(', ')}.`,
    };
  }
  if (!analysis.fetched) {
    return {
      ...base,
      awarded: 0,
      state: 'unknown',
      evidence: `Website not inspected (${analysis.skippedReason ?? 'no fetch'}), so social links are unknown.`,
    };
  }
  return {
    ...base,
    awarded: 0,
    state: 'not-met',
    evidence: 'No social profile links found in the site HTML.',
  };
}

export function computeScoreFactors(place: PlaceSnapshot, analysis: WebsiteAnalysis | null): ScoreFactor[] {
  const hasWebsite = Boolean(place.websiteUri);

  const noWebsite: ScoreFactor = hasWebsite
    ? {
        key: 'no_website',
        label: 'No website',
        maxPoints: 30,
        awarded: 0,
        state: 'not-met',
        evidence: `Website listed: ${place.websiteUri}`,
      }
    : {
        key: 'no_website',
        label: 'No website',
        maxPoints: 30,
        awarded: 30,
        state: 'awarded',
        evidence: 'Google Places returned no website URI for this business.',
      };

  const weakWebsite: ScoreFactor = !hasWebsite
    ? {
        key: 'weak_website',
        label: 'Poor / weak website',
        maxPoints: 20,
        awarded: 0,
        state: 'not-met',
        evidence: 'Not applicable — no website exists (already scored under "No website").',
      }
    : !analysis
      ? {
          key: 'weak_website',
          label: 'Poor / weak website',
          maxPoints: 20,
          awarded: 0,
          state: 'unknown',
          evidence: 'Website present but not analysed yet — run "Analyze Website" to verify.',
        }
      : analysis.siteQuality === 'weak'
        ? {
            key: 'weak_website',
            label: 'Poor / weak website',
            maxPoints: 20,
            awarded: 20,
            state: 'awarded',
            evidence: `Heuristic site check scored ${analysis.siteScore}/100 (weak): ${analysis.signals
              .filter((s) => s.result === 'fail')
              .map((s) => s.label.toLowerCase())
              .join(', ') || 'multiple issues detected'}.`,
          }
        : analysis.siteQuality === 'moderate'
          ? {
              key: 'weak_website',
              label: 'Poor / weak website',
              maxPoints: 20,
              awarded: 10,
              state: 'awarded',
              evidence: `Heuristic site check scored ${analysis.siteScore}/100 (moderate) — meaningful gaps remain.`,
            }
          : analysis.siteQuality === 'unknown'
            ? {
                key: 'weak_website',
                label: 'Poor / weak website',
                maxPoints: 20,
                awarded: 0,
                state: 'unknown',
                evidence: `Website could not be inspected (${analysis.skippedReason ?? 'unknown reason'}).`,
              }
            : {
                key: 'weak_website',
                label: 'Poor / weak website',
                maxPoints: 20,
                awarded: 0,
                state: 'not-met',
                evidence: `Heuristic site check scored ${analysis.siteScore}/100 (strong).`,
              };

  return [
    noWebsite,
    weakWebsite,
    reviewFactor(place.userRatingCount),
    ratingFactor(place.rating),
    activeFactor(place),
    enquiryFlowFactor(place, analysis),
    socialFactor(analysis, place),
  ];
}

export function computeOpportunityScore(input: ScoreInput): OpportunityScore {
  const factors = computeScoreFactors(input.place, input.analysis ?? null);
  const score = clamp(
    factors.reduce((sum, f) => sum + f.awarded, 0),
    0,
    100,
  );
  const maxScoreable = factors.filter((f) => f.state !== 'unknown').reduce((sum, f) => sum + f.maxPoints, 0);

  return {
    score,
    band: bandForScore(score),
    maxScoreable,
    dataCoverage: maxScoreable,
    factors,
    reason: buildScoreReason(input.place, factors, score, maxScoreable),
    generatedBy: 'template',
    computedAt: new Date().toISOString(),
  };
}

/**
 * Template reason — built strictly from retrieved facts.
 * Example: "Strong local presence with 412 reviews but no dedicated website…"
 */
export function buildScoreReason(
  place: PlaceSnapshot,
  factors: ScoreFactor[],
  score = factors.reduce((s, f) => s + f.awarded, 0),
  maxScoreable = factors.filter((f) => f.state !== 'unknown').reduce((s, f) => s + f.maxPoints, 0),
): string {
  const byKey = Object.fromEntries(factors.map((f) => [f.key, f])) as Record<string, ScoreFactor>;
  const parts: string[] = [];

  const reviews = place.userRatingCount;
  const rating = place.rating;
  const presenceBits: string[] = [];
  if (reviews !== null && reviews >= SCORE_THRESHOLDS.reviewVolume.moderate) {
    presenceBits.push(`${formatNumber(reviews)}+ reviews`);
  }
  if (rating !== null && rating >= SCORE_THRESHOLDS.rating.good) {
    presenceBits.push(`${rating.toFixed(1)}★`);
  }

  if (presenceBits.length > 0) {
    parts.push(`Strong local presence with ${presenceBits.join(' and ')}`);
  } else if (reviews !== null) {
    parts.push(`Limited review footprint (${formatNumber(reviews)} reviews)`);
  } else {
    parts.push('Limited visibility data on Google');
  }

  if (byKey.no_website?.state === 'awarded') {
    parts.push('but no dedicated website of its own');
  } else if (byKey.weak_website?.state === 'awarded') {
    parts.push(
      byKey.weak_website.awarded >= 20
        ? 'and its website has clear usability/conversion gaps'
        : 'and its website has a few fixable gaps',
    );
  }

  const gaps: string[] = [];
  if (byKey.missing_enquiry_flow?.state === 'awarded') gaps.push('no direct enquiry flow');
  if (byKey.social_presence?.state === 'awarded') gaps.push('active on social but not owning its funnel');
  if (byKey.active_business?.state === 'awarded') gaps.push('operationally active');

  let sentence = parts.join(' ');
  if (gaps.length > 0) sentence += ` — ${gaps.join(', ')}`;

  const suggestion =
    byKey.no_website?.state === 'awarded'
      ? 'Good candidate for a website plus a direct enquiry system.'
      : byKey.weak_website?.state === 'awarded'
        ? 'Good candidate for a website rebuild and an AI enquiry assistant.'
        : byKey.missing_enquiry_flow?.state === 'awarded'
          ? 'Good candidate for conversion improvements and an AI enquiry assistant.'
          : 'Lower urgency based on the data retrieved — keep in nurture.';

  const coverage =
    maxScoreable < 100
      ? ` Scored on ${maxScoreable}% of the available signals; run the website analysis for a fuller picture.`
      : '';

  return `${sentence}. ${suggestion}${coverage}`;
}

/** Convenience: score + band for table rendering. */
export function scoreMeta(score: number | null | undefined) {
  const value = score ?? 0;
  const band = bandForScore(value);
  return { value, band, meta: BAND_META[band] };
}
