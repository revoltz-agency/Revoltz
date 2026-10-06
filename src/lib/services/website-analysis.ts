/**
 * Website analysis service — live fetch vs. clearly-labelled demo simulation.
 */

import type { Lead, WebsiteAnalysis } from '../types';
import { analyzeWebsite, simulateDemoAnalysis, skippedAnalysisMessage } from '../analysis';
import { DEMO_BUSINESSES } from '../db/demo-data';
import { updateLead } from '../db';
import { isLikelyUrl, nowIso } from '../utils';
import { getConfig } from '../config';

export interface AnalysisRunResult {
  analysis: WebsiteAnalysis | null;
  lead: Lead | null;
  notice: string;
  ok: boolean;
}

function noWebsiteAnalysis(lead: Lead): WebsiteAnalysis {
  return {
    leadId: lead.id,
    url: '',
    analyzedAt: nowIso(),
    mode: lead.isDemo ? 'demo' : 'live',
    fetched: false,
    skippedReason: 'No website listed on Google Places for this business.',
    robotsAllowed: false,
    signals: [],
    siteScore: 0,
    siteQuality: 'unknown',
    socialLinks: [],
    findings: {
      mobileFriendly: 'unknown',
      outdatedDesign: 'unknown',
      missingCta: 'unknown',
      missingWhatsappFlow: 'unknown',
      missingContactFlow: 'fail',
      missingBusinessInfo: 'unknown',
      conversionIssues: ['No website — enquiries can only happen by phone or in person'],
      discoveredEmail: null,
    },
    potentialOpportunity:
      'There is no website to audit. The opportunity is the website itself: a fast mobile page with tap-to-call, a WhatsApp enquiry button and an AI assistant to answer questions after hours.',
    generatedBy: 'template',
    disclaimer: skippedAnalysisMessage,
  };
}

export async function runWebsiteAnalysis(lead: Lead, urlOverride?: string | null): Promise<AnalysisRunResult> {
  const cfg = getConfig();
  const url = (urlOverride ?? lead.place.websiteUri ?? '').trim();

  if (!url) {
    const analysis = noWebsiteAnalysis(lead);
    const updated = updateLead(lead.id, { analysis });
    return {
      analysis,
      lead: updated,
      notice: 'No website on record — nothing was fetched. The score now reflects the missing website only.',
      ok: true,
    };
  }

  if (!isLikelyUrl(url.startsWith('http') ? url : `https://${url}`)) {
    return { analysis: null, lead, notice: `"${url}" is not a valid http(s) URL.`, ok: false };
  }
  const absolute = url.startsWith('http') ? url : `https://${url}`;

  // Demo records are fictional — never hit the network for them.
  if (lead.isDemo) {
    const demoId = lead.place.placeId.replace(/^DEMO_/i, '').toLowerCase();
    const business = DEMO_BUSINESSES.find((b) => b.id === demoId);
    if (!business?.site) {
      const analysis = noWebsiteAnalysis(lead);
      const updated = updateLead(lead.id, { analysis });
      return { analysis, lead: updated, notice: 'Demo Mode — this fictional business has no website record.', ok: true };
    }
    const analysis = simulateDemoAnalysis(lead.id, absolute, business.site);
    const updated = updateLead(lead.id, { analysis });
    return {
      analysis,
      lead: updated,
      notice: 'Demo Mode — simulated audit from the fictional demo record. No network request was made.',
      ok: true,
    };
  }

  if (!cfg.websiteAnalysis.enabled) {
    return {
      analysis: null,
      lead,
      notice: 'Website analysis is disabled on this server (WEBSITE_ANALYSIS_ENABLED=false).',
      ok: false,
    };
  }

  const analysis = await analyzeWebsite({ leadId: lead.id, url: absolute });
  const discoveredEmail = analysis.findings.discoveredEmail;
  const updated = updateLead(lead.id, {
    analysis,
    ...(discoveredEmail && !lead.email ? { email: discoveredEmail, emailSource: 'website_analysis' as const } : {}),
  });

  const notice = analysis.fetched
    ? `Inspected ${analysis.http?.finalUrl ?? absolute} (${Math.round((analysis.http?.bytes ?? 0) / 1024)} KB HTML, HTTP ${
        analysis.http?.status ?? 0
      }). Heuristic score ${analysis.siteScore}/100 → ${analysis.siteQuality}.`
    : `Website not inspected: ${analysis.skippedReason ?? 'unknown reason'}`;

  return { analysis, lead: updated, notice, ok: true };
}
