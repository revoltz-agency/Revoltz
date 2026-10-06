/**
 * Website analysis orchestrator.
 *
 * Live mode: SSRF-guarded, robots.txt-respecting single fetch of the business
 * homepage, then deterministic HTML heuristics.
 * Demo mode: the fictional demo records carry a declared site profile, which we
 * turn into the same report shape — clearly flagged as simulated, never
 * presented as a real audit.
 */

import type { WebsiteAnalysis, WebsiteSignal, AnalysisResult } from '../types';
import { getConfig } from '../config';
import { nowIso, prettyHostname, unique } from '../utils';
import { assertSafeUrl, isPrivateIp, UnsafeUrlError } from './ssrf';
import { checkRobots } from './robots';
import { buildSignals, extractHtmlFacts, qualityForScore } from './html';
import type { DemoSiteProfile } from '../db/demo-data';

export const ANALYSIS_DISCLAIMER =
  'Heuristic HTML inspection only — not a Lighthouse/Core Web Vitals audit, not a security test, and it only reflects the HTML returned on the fetch date shown.';

export const skippedAnalysisMessage =
  'No website inspection was performed for this record, so no technical claims are made about the site.';

export interface AnalyzeInput {
  leadId: string;
  url: string;
}

function skipped(leadId: string, url: string, reason: string): WebsiteAnalysis {
  return {
    leadId,
    url,
    analyzedAt: nowIso(),
    mode: 'live',
    fetched: false,
    skippedReason: reason,
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
      missingContactFlow: 'unknown',
      missingBusinessInfo: 'unknown',
      conversionIssues: [],
      discoveredEmail: null,
    },
    potentialOpportunity: 'Website could not be inspected, so no technical claims are made. Verify manually before pitching.',
    generatedBy: 'template',
    disclaimer: ANALYSIS_DISCLAIMER,
  };
}

export async function analyzeWebsite(input: AnalyzeInput): Promise<WebsiteAnalysis> {
  const cfg = getConfig();
  const { leadId, url } = input;

  if (!cfg.websiteAnalysis.enabled) {
    return skipped(leadId, url, 'website analysis disabled via WEBSITE_ANALYSIS_ENABLED=false');
  }

  let safe;
  try {
    safe = await assertSafeUrl(url, { allowPrivate: cfg.websiteAnalysis.allowPrivate });
  } catch (err) {
    return skipped(leadId, url, err instanceof UnsafeUrlError ? err.message : 'URL rejected by the safety guard');
  }

  const robots = await checkRobots(safe.url.origin, safe.url.pathname || '/', cfg.websiteAnalysis.userAgent, 5_000);
  if (!robots.allowed) {
    const analysis = skipped(leadId, url, robots.reason);
    analysis.robotsAllowed = false;
    return analysis;
  }

  try {
    const started = Date.now();
    const res = await fetch(safe.url.toString(), {
      headers: {
        'User-Agent': cfg.websiteAnalysis.userAgent,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.4',
        'Accept-Language': 'en',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(cfg.websiteAnalysis.timeoutMs),
      cache: 'no-store',
    });

    const finalUrl = res.url || safe.url.toString();
    try {
      const finalHost = new URL(finalUrl).hostname.replace(/^\[|\]$/g, '');
      if (!cfg.websiteAnalysis.allowPrivate && /^\d+\.\d+\.\d+\.\d+$/.test(finalHost) && isPrivateIp(finalHost)) {
        return skipped(leadId, url, 'Redirect target resolved to a private address — blocked.');
      }
    } catch {
      /* keep the original URL if unparsable */
    }

    const contentType = res.headers.get('content-type');
    if (!res.ok) {
      return skipped(leadId, url, `Site returned HTTP ${res.status} for the homepage.`);
    }
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return skipped(leadId, url, `Homepage returned "${contentType}" instead of HTML.`);
    }

    // Read at most maxBytes so a huge page cannot exhaust memory.
    const buffer = Buffer.from(await res.arrayBuffer()).subarray(0, cfg.websiteAnalysis.maxBytes);
    const html = buffer.toString('utf8');
    const durationMs = Date.now() - started;

    const facts = extractHtmlFacts(html, contentType);
    const { signals, siteScore } = buildSignals({
      facts,
      finalUrl,
      requestedUrl: safe.url.toString(),
      lastModified: res.headers.get('last-modified'),
      httpStatus: res.status,
      durationMs,
    });

    return assemble({
      leadId,
      url,
      mode: 'live',
      fetched: true,
      robotsAllowed: true,
      robotsReason: robots.reason,
      finalUrl,
      contentType,
      bytes: facts.bytes,
      durationMs,
      status: res.status,
      lastModified: res.headers.get('last-modified'),
      signals,
      siteScore,
      facts: {
        socialLinks: facts.socialLinks,
        mobileFriendly: !facts.viewportPresent ? 'fail' : facts.viewportDeviceWidth ? 'pass' : 'warn',
        outdatedDesign: facts.outdatedHints.length > 2 ? 'fail' : facts.outdatedHints.length > 0 ? 'warn' : 'pass',
        ctaLabels: facts.ctaLabels,
        formCount: facts.formCount,
        telLinks: facts.telLinks.length,
        mailtoLinks: facts.mailtoLinks,
        whatsappLinks: facts.whatsappLinks.length,
        jsonLdEmails: facts.jsonLdEmails,
        textHasAddress: facts.textHasAddress,
        textHasHours: facts.textHasHours,
        textHasPhone: facts.textHasPhone,
        bookingProviders: facts.bookingProviders,
        bytes: facts.bytes,
        headBlockingScripts: facts.headBlockingScripts,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'TimeoutError' || err.name === 'AbortError'
          ? `Fetch timed out after ${cfg.websiteAnalysis.timeoutMs} ms.`
          : err.message
        : 'Unknown network error.';
    return skipped(leadId, url, message);
  }
}

interface AssembleFacts {
  socialLinks: { platform: string; url: string }[];
  mobileFriendly: AnalysisResult;
  outdatedDesign: AnalysisResult;
  ctaLabels: string[];
  formCount: number;
  telLinks: number;
  mailtoLinks: string[];
  whatsappLinks: number;
  jsonLdEmails: string[];
  textHasAddress: boolean;
  textHasHours: boolean;
  textHasPhone: boolean;
  bookingProviders: string[];
  bytes: number;
  headBlockingScripts: number;
}

function assemble(opts: {
  leadId: string;
  url: string;
  mode: 'live' | 'demo';
  fetched: boolean;
  robotsAllowed: boolean;
  robotsReason?: string;
  finalUrl: string;
  contentType: string | null;
  bytes: number;
  durationMs: number;
  status: number;
  lastModified: string | null;
  signals: WebsiteSignal[];
  siteScore: number;
  facts: AssembleFacts;
}): WebsiteAnalysis {
  const { facts, signals } = opts;
  const conversionIssues: string[] = [];
  if (facts.mobileFriendly !== 'pass') conversionIssues.push('Page is not mobile-friendly (no responsive viewport detected)');
  if (facts.ctaLabels.length === 0) conversionIssues.push('No clear call-to-action for a visitor to take');
  if (facts.formCount === 0) conversionIssues.push('No enquiry form — no way to capture a lead on-site');
  if (facts.whatsappLinks === 0) conversionIssues.push('No WhatsApp click-to-chat link');
  if (facts.telLinks === 0) conversionIssues.push('No tap-to-call link');
  if (!facts.textHasHours) conversionIssues.push('Opening hours not published on the page');
  if (!facts.textHasAddress) conversionIssues.push('Address not clearly published on the page');
  if (facts.bytes > 600_000 || facts.headBlockingScripts > 6) {
    conversionIssues.push(`Heavy front-end (${Math.round(facts.bytes / 1024)} KB HTML, ${facts.headBlockingScripts} blocking scripts)`);
  }

  const discoveredEmail = [...facts.mailtoLinks, ...facts.jsonLdEmails].find((e) => e && e.length < 120) ?? null;

  return {
    leadId: opts.leadId,
    url: opts.url,
    analyzedAt: nowIso(),
    mode: opts.mode,
    fetched: opts.fetched,
    skippedReason: opts.fetched ? undefined : opts.robotsReason,
    robotsAllowed: opts.robotsAllowed,
    http: {
      status: opts.status,
      finalUrl: opts.finalUrl,
      contentType: opts.contentType,
      bytes: opts.bytes,
      durationMs: opts.durationMs,
      lastModified: opts.lastModified,
    },
    signals,
    siteScore: opts.siteScore,
    siteQuality: opts.fetched ? qualityForScore(opts.siteScore) : 'unknown',
    socialLinks: facts.socialLinks,
    findings: {
      mobileFriendly: facts.mobileFriendly,
      outdatedDesign: facts.outdatedDesign,
      missingCta: facts.ctaLabels.length === 0 ? 'fail' : facts.ctaLabels.length < 3 ? 'warn' : 'pass',
      missingWhatsappFlow: facts.whatsappLinks === 0 ? 'fail' : 'pass',
      missingContactFlow:
        facts.formCount === 0 && facts.telLinks === 0 && facts.mailtoLinks.length === 0 && facts.whatsappLinks === 0
          ? 'fail'
          : facts.formCount === 0
            ? 'warn'
            : 'pass',
      missingBusinessInfo:
        facts.textHasAddress && facts.textHasHours && facts.textHasPhone
          ? 'pass'
          : facts.textHasAddress || facts.textHasPhone
            ? 'warn'
            : 'fail',
      conversionIssues,
      discoveredEmail,
    },
    potentialOpportunity: buildPotentialOpportunity(opts.fetched ? facts : null, opts.siteScore, opts.mode),
    generatedBy: 'template',
    disclaimer:
      opts.mode === 'demo'
        ? 'DEMO MODE — this report is simulated from the fictional demo record. No network request was made.'
        : ANALYSIS_DISCLAIMER + (opts.robotsReason ? ` robots.txt: ${opts.robotsReason}` : ''),
  };
}

/** Template "potential opportunity" — only references detected signals. */
export function buildPotentialOpportunity(facts: AssembleFacts | null, siteScore: number, mode: 'live' | 'demo'): string {
  if (!facts) {
    return 'No website inspection data available, so no opportunity can be claimed from the site itself.';
  }
  const prefix = mode === 'demo' ? '(Simulated demo audit) ' : '';
  const issues: string[] = [];
  if (facts.mobileFriendly !== 'pass') issues.push('a mobile-first rebuild');
  if (facts.formCount === 0) issues.push('an on-page enquiry form');
  if (facts.whatsappLinks === 0) issues.push('a WhatsApp click-to-chat flow');
  if (facts.ctaLabels.length === 0) issues.push('clear calls-to-action');
  if (facts.outdatedDesign === 'fail') issues.push('a modern design refresh');
  if (facts.bookingProviders.length === 0 && facts.formCount === 0) issues.push('online booking or lead capture');

  if (issues.length === 0) {
    return `${prefix}The site already covers the basics (score ${siteScore}/100). The opportunity is narrower: conversion optimisation, an AI enquiry assistant for after-hours messages, and local-SEO content expansion.`;
  }
  const top = issues.slice(0, 3);
  return `${prefix}Heuristic score ${siteScore}/100. Highest-value opportunity: ${top.join(', ')} — plus an AI assistant to answer enquiries instantly and route them to the owner.`;
}

/**
 * Demo Mode: turn the fictional record's declared site profile into the same
 * report shape. Clearly labelled `mode: 'demo'` everywhere.
 */
export function simulateDemoAnalysis(leadId: string, url: string, profile: DemoSiteProfile): WebsiteAnalysis {
  const facts = extractFactsFromProfile(profile);
  const signals = profileSignals(profile, url);
  const earned = signals.reduce((sum, s) => sum + s.earned, 0);
  const total = signals.reduce((sum, s) => sum + s.weight, 0);
  const siteScore = total > 0 ? Math.round((earned / total) * 100) : 0;

  return assemble({
    leadId,
    url,
    mode: 'demo',
    fetched: true,
    robotsAllowed: true,
    robotsReason: 'Demo Mode — no robots.txt request was made.',
    finalUrl: profile.finalUrl,
    contentType: profile.contentType,
    bytes: profile.bytes,
    durationMs: profile.durationMs,
    status: profile.status,
    lastModified: profile.lastModified,
    signals: signals.map(({ weight: _w, earned: _e, ...rest }) => rest),
    siteScore,
    facts,
  });
}

function extractFactsFromProfile(p: DemoSiteProfile): AssembleFacts {
  return {
    socialLinks: p.social,
    mobileFriendly: !p.viewport ? 'fail' : 'pass',
    outdatedDesign: p.outdatedHints.length > 2 ? 'fail' : p.outdatedHints.length > 0 ? 'warn' : 'pass',
    ctaLabels: p.ctaCount > 0 ? Array.from({ length: p.ctaCount }, (_, i) => (i === 0 ? 'Contact Us' : 'Learn more')) : [],
    formCount: p.formCount,
    telLinks: p.telLinks,
    mailtoLinks: p.mailtoLinks,
    whatsappLinks: p.whatsappLinks,
    jsonLdEmails: [],
    textHasAddress: p.addressOnPage,
    textHasHours: p.hoursOnPage,
    textHasPhone: p.phoneOnPage,
    bookingProviders: [],
    bytes: p.bytes,
    headBlockingScripts: p.outdatedHints.length,
  };
}

interface DemoWeightedSignal extends WebsiteSignal {
  weight: number;
  earned: number;
}

function demoSig(
  key: string,
  label: string,
  result: AnalysisResult,
  detail: string,
  weight: number,
  earned: number,
): DemoWeightedSignal {
  return { key, label, result, detail, weight, earned };
}

function profileSignals(p: DemoSiteProfile, url: string): DemoWeightedSignal[] {
  const signals: DemoWeightedSignal[] = [];
  signals.push(
    p.viewport
      ? demoSig('mobile_viewport', 'Mobile viewport', 'pass', 'Simulated: viewport meta with width=device-width present.', 20, 20)
      : demoSig('mobile_viewport', 'Mobile viewport', 'fail', 'Simulated: no viewport meta tag on the page.', 20, 0),
  );
  signals.push(
    p.https
      ? demoSig('https', 'HTTPS', 'pass', 'Simulated: page served over HTTPS.', 10, 10)
      : demoSig('https', 'HTTPS', 'fail', `Simulated: ${prettyHostname(url)} is served over plain HTTP.`, 10, 0),
  );
  signals.push(
    p.ctaCount === 0
      ? demoSig('cta', 'Visible call-to-action', 'fail', 'Simulated: no action-oriented buttons detected.', 15, 0)
      : p.ctaCount < 3
        ? demoSig('cta', 'Visible call-to-action', 'warn', `Simulated: only ${p.ctaCount} CTA-like link(s).`, 15, 10)
        : demoSig('cta', 'Visible call-to-action', 'pass', `Simulated: ${p.ctaCount} CTA-like links detected.`, 15, 15),
  );
  signals.push(
    p.formCount === 0
      ? demoSig('enquiry_form', 'Enquiry form', 'fail', 'Simulated: no <form> element on the page.', 15, 0)
      : demoSig('enquiry_form', 'Enquiry form', 'pass', `Simulated: ${p.formCount} enquiry form(s) present.`, 15, 15),
  );

  let contactEarned = 0;
  const contactBits: string[] = [];
  if (p.telLinks > 0) {
    contactEarned += 3.34;
    contactBits.push(`${p.telLinks} tel: link(s)`);
  }
  if (p.mailtoLinks.length > 0) {
    contactEarned += 3.33;
    contactBits.push(`${p.mailtoLinks.length} mailto: link(s)`);
  }
  if (p.whatsappLinks > 0) {
    contactEarned += 3.33;
    contactBits.push(`${p.whatsappLinks} WhatsApp link(s)`);
  }
  signals.push(
    demoSig(
      'contact_flow',
      'Direct contact flow (call / email / WhatsApp)',
      contactBits.length === 0 ? 'fail' : contactEarned >= 9.9 ? 'pass' : 'warn',
      contactBits.length === 0 ? 'Simulated: no tel:, mailto: or wa.me links.' : `Simulated: ${contactBits.join('; ')}.`,
      10,
      Math.round(contactEarned),
    ),
  );

  const titleOk = p.title.length >= 10 && p.title.length <= 70;
  const descOk = Boolean(p.metaDescription && p.metaDescription.length >= 70);
  signals.push(
    demoSig(
      'seo_basics',
      'Search basics (title + meta description)',
      titleOk && descOk ? 'pass' : !titleOk && !descOk ? 'fail' : 'warn',
      `Simulated: title "${p.title}" (${p.title.length} chars); meta description ${p.metaDescription ? `${p.metaDescription.length} chars` : 'missing'}.`,
      10,
      (titleOk ? 5 : 0) + (descOk ? 5 : 0),
    ),
  );
  signals.push(
    p.h1Count === 1
      ? demoSig('h1', 'Heading structure', 'pass', 'Simulated: exactly one <h1>.', 5, 5)
      : p.h1Count === 0
        ? demoSig('h1', 'Heading structure', 'fail', 'Simulated: no <h1> found.', 5, 0)
        : demoSig('h1', 'Heading structure', 'warn', `Simulated: ${p.h1Count} <h1> elements.`, 5, 2),
  );

  const newestYear = Math.max(p.copyrightYear ?? 0, p.lastModified ? new Date(p.lastModified).getUTCFullYear() : 0);
  const currentYear = new Date().getUTCFullYear();
  signals.push(
    newestYear === 0
      ? demoSig('freshness', 'Content freshness', 'unknown', 'Simulated: no date evidence.', 10, 5)
      : currentYear - newestYear >= 4
        ? demoSig('freshness', 'Content freshness', 'fail', `Simulated: newest date evidence is ${newestYear}.`, 10, 0)
        : currentYear - newestYear >= 2
          ? demoSig('freshness', 'Content freshness', 'warn', `Simulated: newest date evidence is ${newestYear}.`, 10, 5)
          : demoSig('freshness', 'Content freshness', 'pass', `Simulated: newest date evidence is ${newestYear}.`, 10, 10),
  );
  signals.push(
    p.outdatedHints.length === 0
      ? demoSig('stack', 'Design/stack age markers', 'pass', `Simulated: no legacy markers${p.generator ? ` (builder: ${p.generator})` : ''}.`, 5, 5)
      : demoSig('stack', 'Design/stack age markers', 'fail', `Simulated legacy markers: ${p.outdatedHints.join(', ')}${p.generator ? ` (builder: ${p.generator})` : ''}.`, 5, 0),
  );
  signals.push(
    demoSig(
      'business_info',
      'Key business information on page',
      p.addressOnPage && p.hoursOnPage && p.phoneOnPage ? 'pass' : p.addressOnPage || p.phoneOnPage ? 'warn' : 'fail',
      `Simulated: address ${p.addressOnPage ? 'found' : 'not found'}, hours ${p.hoursOnPage ? 'found' : 'not found'}, phone ${
        p.phoneOnPage ? 'found' : 'not found'
      }.`,
      0,
      0,
    ),
  );
  signals.push(
    demoSig(
      'page_weight',
      'Page weight & blocking resources (heuristic)',
      p.bytes > 600_000 ? 'warn' : 'pass',
      `Simulated: HTML ${Math.round(p.bytes / 1024)} KB, fetched in ${p.durationMs} ms (HTTP ${p.status}).`,
      0,
      0,
    ),
  );
  if (p.social.length > 0) {
    signals.push(
      demoSig('social', 'Social profiles linked from the site', 'pass', `Simulated: ${unique(p.social.map((s) => s.platform)).join(', ')}.`, 0, 0),
    );
  }
  return signals;
}
