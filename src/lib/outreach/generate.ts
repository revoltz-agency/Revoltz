/**
 * Outreach draft generation.
 *
 * Two paths, both honest:
 *  • AI path — only when a provider key exists; the prompt is restricted to
 *    verified facts and the output is validated/sanitised.
 *  • Template path — deterministic copy assembled from the same verified facts,
 *    used automatically whenever AI is unavailable. The UI labels which path ran.
 *
 * Nothing is ever sent. We only produce copy plus `mailto:` / `wa.me` links that
 * the user has to click and send themselves.
 */

import type { Lead, OutreachDraft, PitchTone, ServiceKey, Settings } from '../types';
import { SERVICES, SERVICE_LABELS } from '../types';
import { generateJson } from '../ai/client';
import { collectVerifiedFacts, pitchPrompt, scoreReasonPrompt, type PitchSchema, type VerifiedFacts } from '../ai/prompts';
import { digitsOnly, formatNumber, isValidEmail, normalisePhone, prettyHostname, nowIso } from '../utils';

const WHATSAPP_LIMIT = 480;

export function sanitizeCopy(text: string, businessName: string): string {
  let out = text
    .replace(/```/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\w)\*(?!\*)/g, '')
    .replace(/\[business(?: name)?\]/gi, businessName)
    .replace(/\[name\]/gi, businessName)
    .replace(/\[(city|location)\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}

function serviceLabelFor(service: ServiceKey | null | undefined): string {
  if (service && SERVICE_LABELS[service]) return SERVICE_LABELS[service];
  return 'websites and AI automation';
}

function observationFor(facts: VerifiedFacts, lead: Lead): string {
  const reviewBit =
    facts.reviewCount !== 'not retrieved' && Number.parseInt(facts.reviewCount.replace(/,/g, ''), 10) >= 50
      ? `You already have ${facts.reviewCount} Google reviews${facts.rating !== 'not retrieved' ? ` at ${facts.rating.split(' ')[0]}★` : ''}`
      : null;

  if (!facts.hasWebsite) {
    return `${reviewBit ? `${reviewBit}, so ` : ''}I noticed there is no website listed for ${facts.business} yet — most of that attention probably goes to whoever answers first.`;
  }

  const audit = lead.analysis;
  if (audit && audit.fetched) {
    const issues: string[] = [];
    if (audit.findings.mobileFriendly === 'fail') issues.push('it does not adapt to mobile screens');
    if (audit.findings.missingContactFlow === 'fail') issues.push('there is no enquiry form');
    if (audit.findings.missingWhatsappFlow === 'fail') issues.push('no WhatsApp click-to-chat');
    if (audit.findings.missingCta === 'fail') issues.push('no clear call-to-action');
    if (audit.findings.outdatedDesign === 'fail') issues.push('the design looks dated');
    if (issues.length > 0) {
      return `I opened ${facts.websiteDomain} on my phone and saw that ${issues.join(', ')}.`;
    }
    return `I opened ${facts.websiteDomain} and it covers the basics well${reviewBit ? `, and ${reviewBit.toLowerCase()}` : ''}.`;
  }

  return reviewBit
    ? `${reviewBit} and you have a website listed (${facts.websiteDomain}).`
    : `I found ${facts.business} on Google Maps with a website listed (${facts.websiteDomain}).`;
}

function ideaFor(facts: VerifiedFacts, lead: Lead, service: ServiceKey | null): string {
  const chosen: ServiceKey | null = service ?? lead.crm.assignedService ?? null;
  if (!facts.hasWebsite) {
    return chosen === 'AI_CHATBOT' || chosen === 'AI_AUTOMATION'
      ? `A simple one-page site with an AI assistant that answers timings, prices and directions instantly, then sends you the serious enquiries on WhatsApp.`
      : `A fast mobile-first one-page site with a one-tap WhatsApp enquiry button, so people can reach you directly instead of only calling.`;
  }
  if (lead.analysis?.findings.missingContactFlow === 'fail' || lead.analysis?.findings.missingWhatsappFlow === 'fail') {
    return `Adding an enquiry form plus a WhatsApp click-to-chat button on ${facts.websiteDomain ?? 'your site'} would capture visitors who currently leave without contacting you.`;
  }
  if (lead.analysis?.findings.mobileFriendly === 'fail') {
    return `Rebuilding ${facts.websiteDomain ?? 'your site'} mobile-first would make it far easier for people to read and enquire from a phone.`;
  }
  if (chosen === 'AI_CHATBOT') return `An AI assistant on your site and WhatsApp to answer questions instantly and book appointments for you.`;
  if (chosen === 'FINANCE_AUTOMATION') return `Automating your invoicing and follow-ups so the back office stops eating your evenings.`;
  if (chosen === 'SOCIAL_MEDIA') return `Turning your existing reviews and photos into a steady local social presence that feeds enquiries.`;
  return `An AI enquiry assistant plus a conversion-focused page to turn your Google traffic into booked appointments.`;
}

const OPT_OUT_LINE = 'Reply STOP and I will not message again.';

/** Guarantees the opt-out line survives, truncating the body instead of the suffix. */
export function withOptOut(text: string, limit = WHATSAPP_LIMIT): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.toLowerCase().includes('stop') && trimmed.toLowerCase().includes('not message')) {
    return trimmed.slice(0, limit);
  }
  const suffix = ` ${OPT_OUT_LINE}`;
  const room = Math.max(0, limit - suffix.length);
  const body = trimmed.length > room ? `${trimmed.slice(0, Math.max(0, room - 1)).trimEnd()}…` : trimmed;
  return `${body}${suffix}`.slice(0, limit);
}

/** Condensed observation for the WhatsApp draft (character budget is tight). */
function shortObservationFor(facts: VerifiedFacts, lead: Lead): string {
  if (!facts.hasWebsite) return 'I noticed there is no website listed for you yet.';
  const audit = lead.analysis;
  if (audit?.fetched) {
    const issues: string[] = [];
    if (audit.findings.mobileFriendly === 'fail') issues.push('it does not adapt to mobile');
    if (audit.findings.missingContactFlow === 'fail') issues.push('there is no enquiry form');
    if (audit.findings.missingWhatsappFlow === 'fail') issues.push('there is no WhatsApp button');
    if (audit.findings.missingCta === 'fail') issues.push('there is no clear call-to-action');
    if (issues.length > 0) return `I opened ${facts.websiteDomain} on my phone and saw ${issues.slice(0, 2).join(' and ')}.`;
  }
  return `I found your Google listing and had a look at ${facts.websiteDomain ?? 'your website'}.`;
}

/** Condensed offer line for the WhatsApp draft. */
function shortIdeaFor(facts: VerifiedFacts, lead: Lead): string {
  if (!facts.hasWebsite) {
    return 'A fast one-page site with a tap-to-WhatsApp enquiry button would send those enquiries straight to you.';
  }
  if (lead.analysis?.findings.missingContactFlow === 'fail' || lead.analysis?.findings.missingWhatsappFlow === 'fail') {
    return 'Adding an enquiry form and a WhatsApp button would capture the visitors who leave without contacting you.';
  }
  if (lead.analysis?.findings.mobileFriendly === 'fail') {
    return 'A mobile-first rebuild would make it far easier for people to read and enquire from a phone.';
  }
  return 'An AI enquiry assistant could answer pricing and timing questions instantly and send you the serious ones.';
}

export function buildTemplatePitch(
  lead: Lead,
  settings: Settings,
  tone: PitchTone,
  service: ServiceKey | null,
): OutreachDraft {
  const facts = collectVerifiedFacts(lead, settings.agency, service);
  const business = facts.business;
  const category = facts.category.toLowerCase();
  const city = facts.city || settings.agency.city;
  const sender = settings.agency.senderName || settings.agency.name;
  const agency = settings.agency.name;
  const observation = observationFor(facts, lead);
  const idea = ideaFor(facts, lead, service);
  const intro = settings.pitch.introLine || 'I run an AI/web agency that helps local businesses improve their online presence and convert more enquiries.';
  const cta = settings.pitch.ctaLine || 'Would you be open to seeing a quick demo?';

  const subject = !facts.hasWebsite
    ? `Quick idea for ${business}`
    : lead.analysis?.findings.mobileFriendly === 'fail'
      ? `${business} — your site on mobile`
      : `${business} — one idea to get more enquiries from Google`;

  const greeting = tone === 'friendly' ? `Hi ${business} team,` : tone === 'direct' ? `${business} —` : `Hi ${business} team,`;

  const body =
    tone === 'direct'
      ? `${greeting}\n\n${observation}\n\n${intro} ${idea}\n\n${cta}\n\n${sender}\n${agency}`
      : `${greeting}\n\nI came across ${business} while researching ${category} businesses in ${city}. ${observation}\n\n${intro}\n\n${idea}\n\n${cta} If it is not useful, no problem at all — I will not follow up again.\n\n${sender}\n${agency}${settings.agency.senderEmail ? `\n${settings.agency.senderEmail}` : ''}${
          settings.agency.whatsappNumber ? `\nWhatsApp: +${digitsOnly(settings.agency.whatsappNumber)}` : ''
        }`;

  const waObservation = shortObservationFor(facts, lead);
  const waIdea = shortIdeaFor(facts, lead);
  // Short, fixed positioning line — the full intro is used in the email instead.
  const waOffer = 'We help local businesses turn their Google listing into real enquiries.';
  const whatsapp = withOptOut(
    `Hi ${business} 👋 I came across your listing while researching ${category} in ${city}. ${waObservation} ${waOffer} ${waIdea} ${cta}`,
  );

  const factsUsed = [
    facts.hasWebsite ? `Website listed: ${facts.websiteDomain}` : 'No website listed on Google Places',
    facts.rating !== 'not retrieved' ? `Google rating ${facts.rating}` : null,
    facts.reviewCount !== 'not retrieved' ? `${facts.reviewCount} Google reviews` : null,
    facts.businessStatus !== 'not retrieved' ? `Business status: ${facts.businessStatus}` : null,
    lead.analysis?.fetched ? `Website heuristic score ${lead.analysis.siteScore}/100 (${lead.analysis.siteQuality})` : null,
    lead.analysis?.findings.missingContactFlow === 'fail' ? 'No enquiry form detected on the site' : null,
    lead.analysis?.findings.missingWhatsappFlow === 'fail' ? 'No WhatsApp click-to-chat detected on the site' : null,
    lead.score ? `Opportunity score ${lead.score.score}/100 (${lead.score.band})` : null,
  ].filter((v): v is string => Boolean(v));

  const draft: OutreachDraft = {
    leadId: lead.id,
    generatedAt: nowIso(),
    generatedBy: 'template',
    tone,
    emailSubject: subject,
    emailBody: body.slice(0, 2400),
    whatsappDraft: whatsapp,
    factsUsed,
    mailtoHref: null,
    whatsappHref: null,
  };
  return attachLinks(draft, lead, settings);
}

export function attachLinks(draft: OutreachDraft, lead: Lead, settings: Settings): OutreachDraft {
  const email = lead.email && isValidEmail(lead.email) ? lead.email : null;
  const phone = normalisePhone(
    lead.place.internationalPhoneNumber ?? lead.place.nationalPhoneNumber,
    settings.agency.defaultCountryCode || '91',
  );

  return {
    ...draft,
    mailtoHref: email
      ? `mailto:${email}?subject=${encodeURIComponent(draft.emailSubject)}&body=${encodeURIComponent(draft.emailBody)}`
      : null,
    whatsappHref: phone && phone.length >= 8 ? `https://wa.me/${phone}?text=${encodeURIComponent(draft.whatsappDraft)}` : null,
  };
}

export interface GenerateOutreachInput {
  lead: Lead;
  settings: Settings;
  tone?: PitchTone;
  service?: ServiceKey | null;
  preferAi?: boolean;
}

export interface GenerateOutreachResult {
  draft: OutreachDraft;
  notice: string | null;
  usedAi: boolean;
}

export async function generateOutreach(input: GenerateOutreachInput): Promise<GenerateOutreachResult> {
  const { lead, settings } = input;
  const tone = input.tone ?? settings.pitch.tone ?? 'professional';
  const service = input.service ?? lead.crm.assignedService ?? null;
  const fallback = buildTemplatePitch(lead, settings, tone, service);

  if (input.preferAi === false) {
    return { draft: fallback, notice: 'Generated from verified data with built-in templates (AI skipped).', usedAi: false };
  }

  const facts = collectVerifiedFacts(lead, settings.agency, service);
  const prompt = pitchPrompt(facts, tone, {
    intro: settings.pitch.introLine,
    offer: settings.pitch.offerLine,
    cta: settings.pitch.ctaLine,
  });

  const result = await generateJson<PitchSchema>({ system: prompt.system, user: prompt.user });
  if (!result.ok || !result.data) {
    return {
      draft: fallback,
      notice: result.error
        ? `AI unavailable (${result.error}) — used verified-data templates instead.`
        : 'AI unavailable — used verified-data templates instead.',
      usedAi: false,
    };
  }

  const data = result.data;
  const business = lead.place.displayName;
  const subject = sanitizeCopy(String(data.emailSubject ?? ''), business).slice(0, 120) || fallback.emailSubject;
  const body = sanitizeCopy(String(data.emailBody ?? ''), business).slice(0, 2400) || fallback.emailBody;
  const whatsappRaw = sanitizeCopy(String(data.whatsappDraft ?? ''), business);
  // Always keep an explicit opt-out line in the WhatsApp draft.
  const whatsappFinal = whatsappRaw ? withOptOut(whatsappRaw) : fallback.whatsappDraft;

  const factsUsed = Array.isArray(data.factsUsed)
    ? data.factsUsed.filter((f): f is string => typeof f === 'string' && f.length > 0).slice(0, 8)
    : fallback.factsUsed;

  const draft: OutreachDraft = {
    leadId: lead.id,
    generatedAt: nowIso(),
    generatedBy: 'ai',
    tone,
    emailSubject: subject,
    emailBody: body,
    whatsappDraft: whatsappFinal,
    factsUsed: factsUsed.length > 0 ? factsUsed : fallback.factsUsed,
    mailtoHref: null,
    whatsappHref: null,
    model: result.model ?? null,
  };

  return {
    draft: attachLinks(draft, lead, settings),
    notice: `Drafted by ${result.model ?? 'the AI model'} using only verified lead data. Review before sending.`,
    usedAi: true,
  };
}

/** Short "why this lead" line for the score card (AI-enhanced when available). */
export async function generateScoreReason(lead: Lead, settings: Settings): Promise<{ reason: string; generatedBy: 'ai' | 'template'; notice: string | null }> {
  const template = lead.score?.reason ?? '';
  const facts = collectVerifiedFacts(lead, settings.agency, lead.crm.assignedService);
  const result = await generateJson<{ reason: string }>(scoreReasonPrompt(facts));
  if (!result.ok || !result.data?.reason) {
    return { reason: template, generatedBy: 'template', notice: result.error ?? null };
  }
  const reason = sanitizeCopy(String(result.data.reason), lead.place.displayName).slice(0, 400);
  if (reason.split(/\s+/).length > 45) return { reason: template, generatedBy: 'template', notice: 'AI reason was too long — kept the deterministic one.' };
  return { reason, generatedBy: 'ai', notice: `Rewritten by ${result.model ?? 'AI'} from the same verified facts.` };
}

export { SERVICES };
