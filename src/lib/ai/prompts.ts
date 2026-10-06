/**
 * AI prompts. Every prompt is built around the same rule:
 * the model may ONLY use the verified facts handed to it, and must never
 * invent numbers, claims, technologies or outcomes.
 */

import type { Lead, PitchTone, WebsiteAnalysis } from '../types';
import { formatNumber, prettyHostname, prettyPlaceType } from '../utils';
import { SERVICES } from '../types';

export const HONESTY_SYSTEM_RULES = `You are a research assistant for a small AI/web agency.
ABSOLUTE RULES:
1. Use ONLY the facts inside the VERIFIED FACTS block. Never invent, assume or extrapolate anything else.
2. If a fact is "unknown", "not retrieved" or null, do NOT mention that topic at all.
3. Never claim a metric, tool, technology, competitor, price or result that is not in the facts.
4. Never imply you have visited, tested or benchmarked something unless the facts say it was inspected.
5. No hype words like "guaranteed", "best in the world", "#1". No fake urgency, no deception.
6. Plain text only: no markdown, no asterisks, no emojis unless the facts include one, no placeholders like [Business].
7. Respond with a single valid JSON object and nothing else.`;

export interface VerifiedFacts {
  business: string;
  category: string;
  city: string;
  address: string | null;
  rating: string;
  reviewCount: string;
  hasWebsite: boolean;
  websiteDomain: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
  businessStatus: string;
  openNow: string;
  opportunityScore: string;
  scoreBand: string;
  topScoreFactors: string[];
  websiteAudit: string[];
  agency: { name: string; sender: string; city: string; services: string[] };
  requestedService: string | null;
  isDemoData: boolean;
}

export function collectVerifiedFacts(
  lead: Lead,
  agency: { name: string; senderName: string; city: string },
  requestedService?: string | null,
): VerifiedFacts {
  const analysis = lead.analysis;
  const auditLines: string[] = [];
  if (analysis) {
    auditLines.push(
      analysis.mode === 'demo'
        ? `Simulated demo audit of ${prettyHostname(analysis.url)} (heuristic score ${analysis.siteScore}/100, quality: ${analysis.siteQuality})`
        : `Heuristic HTML inspection of ${prettyHostname(analysis.url)} on ${analysis.analyzedAt.slice(0, 10)} scored ${analysis.siteScore}/100 (quality: ${analysis.siteQuality})`,
    );
    for (const s of analysis.signals) {
      if (s.result === 'fail' || s.result === 'warn') auditLines.push(`${s.label}: ${s.detail}`);
    }
    if (analysis.findings.conversionIssues.length > 0) {
      auditLines.push(`Conversion gaps: ${analysis.findings.conversionIssues.join('; ')}`);
    }
    if (analysis.socialLinks.length > 0) {
      auditLines.push(`Social profiles linked from the site: ${analysis.socialLinks.map((s) => s.platform).join(', ')}`);
    }
  }

  const serviceLabel =
    requestedService && SERVICES.find((s) => s.key === requestedService)?.label
      ? SERVICES.find((s) => s.key === requestedService)!.label
      : lead.crm.assignedService
        ? SERVICES.find((s) => s.key === lead.crm.assignedService)?.label ?? null
        : null;

  return {
    business: lead.place.displayName,
    category: prettyPlaceType(lead.place.primaryType ?? lead.query?.industry ?? 'local business'),
    city: lead.query?.city ?? agency.city ?? '',
    address: lead.place.formattedAddress,
    rating: lead.place.rating !== null ? `${lead.place.rating.toFixed(1)} out of 5` : 'not retrieved',
    reviewCount: lead.place.userRatingCount !== null ? formatNumber(lead.place.userRatingCount) : 'not retrieved',
    hasWebsite: Boolean(lead.place.websiteUri),
    websiteDomain: lead.place.websiteUri ? prettyHostname(lead.place.websiteUri) : null,
    hasPhone: Boolean(lead.place.internationalPhoneNumber || lead.place.nationalPhoneNumber),
    hasEmail: Boolean(lead.email),
    businessStatus: lead.place.businessStatus ?? 'not retrieved',
    openNow: lead.place.openNow === null ? 'not retrieved' : lead.place.openNow ? 'yes' : 'no',
    opportunityScore: lead.score ? `${lead.score.score}/100` : 'not calculated',
    scoreBand: lead.score?.band ?? 'unknown',
    topScoreFactors: (lead.score?.factors ?? [])
      .filter((f) => f.state === 'awarded')
      .sort((a, b) => b.awarded - a.awarded)
      .map((f) => `${f.label} (+${f.awarded}): ${f.evidence}`),
    websiteAudit: auditLines,
    agency: {
      name: agency.name || 'our agency',
      sender: agency.senderName || 'the founder',
      city: agency.city || '',
      services: SERVICES.map((s) => s.label),
    },
    requestedService: serviceLabel,
    isDemoData: lead.isDemo,
  };
}

export function factsToText(facts: VerifiedFacts): string {
  return `VERIFIED FACTS
- Business name: ${facts.business}
- Category: ${facts.category}
- City: ${facts.city || 'not retrieved'}
- Address: ${facts.address ?? 'not retrieved'}
- Google rating: ${facts.rating}
- Google review count: ${facts.reviewCount}
- Has website: ${facts.hasWebsite ? `yes (${facts.websiteDomain})` : 'no website listed on Google Places'}
- Phone listed: ${facts.hasPhone ? 'yes' : 'no'}
- Email known: ${facts.hasEmail ? 'yes' : 'no'}
- Business status: ${facts.businessStatus}
- Open now: ${facts.openNow}
- Opportunity score: ${facts.opportunityScore} (band: ${facts.scoreBand})
- Score evidence:
${facts.topScoreFactors.length ? facts.topScoreFactors.map((f) => `  * ${f}`).join('\n') : '  * none'}
- Website inspection:
${facts.websiteAudit.length ? facts.websiteAudit.map((f) => `  * ${f}`).join('\n') : '  * not performed'}
- Sender agency: ${facts.agency.name} (${facts.agency.city || 'city not set'}), services offered: ${facts.agency.services.join(', ')}
- Service to focus on (if any): ${facts.requestedService ?? 'choose the single most relevant one from the list above'}
- Demo data: ${facts.isDemoData ? 'yes — fictional record used for demo mode' : 'no'}`;
}

export interface PitchSchema {
  emailSubject: string;
  emailBody: string;
  whatsappDraft: string;
  factsUsed: string[];
}

export function pitchPrompt(facts: VerifiedFacts, tone: PitchTone, lines: { intro: string; offer: string; cta: string }) {
  const toneGuide =
    tone === 'friendly'
      ? 'Warm, conversational, one light emoji maximum in the WhatsApp draft only.'
      : tone === 'direct'
        ? 'Short, blunt, businesslike. Two or three sentences per message.'
        : 'Polite and professional, plain business English.';

  return {
    system: HONESTY_SYSTEM_RULES,
    user: `${factsToText(facts)}

TASK: write a first-touch outreach message for this business.
Tone: ${toneGuide}

Constraints:
- Email body: 90-130 words, plain text, short paragraphs, no markdown, no links.
- WhatsApp draft: max 420 characters, one short paragraph, ends with an opt-out line: "Reply STOP and I will not message again."
- Start from what we genuinely observed. Mention the business by name and the city/category only as given.
- Offer exactly ONE concrete idea tied to the verified gaps (never a list of five services).
- Ask for a short demo/15-minute call — never promise results, revenue numbers or rankings.
- Sign off with: ${facts.agency.sender || 'the founder'}, ${facts.agency.name}.
- Agency positioning line to weave in naturally: "${lines.intro}"
- Offer line style: "${lines.offer}"
- Closing question style: "${lines.cta}"
- factsUsed: list the 3-6 verified facts you actually referenced (copy them from VERIFIED FACTS).

Return JSON:
{"emailSubject": string, "emailBody": string, "whatsappDraft": string, "factsUsed": string[]}`,
  };
}

export function scoreReasonPrompt(facts: VerifiedFacts) {
  return {
    system: HONESTY_SYSTEM_RULES,
    user: `${factsToText(facts)}

TASK: write ONE sentence (max 32 words) explaining why this lead has this opportunity score, referencing only the verified facts (review count, rating, website presence, audit gaps). End with a short, concrete suggestion of what to offer.
Return JSON: {"reason": string}`,
  };
}

export function opportunityPrompt(analysis: WebsiteAnalysis, facts: VerifiedFacts) {
  return {
    system: HONESTY_SYSTEM_RULES,
    user: `${factsToText(facts)}

TASK: based strictly on the website inspection results above, write a "Potential opportunity" paragraph (max 70 words) describing what to build/fix first and why, in plain language a business owner would understand. Mention only detected findings. Never claim performance numbers, rankings or revenue impact.
Return JSON: {"potentialOpportunity": string}`,
  };
}
