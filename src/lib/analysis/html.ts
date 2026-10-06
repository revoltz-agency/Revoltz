/**
 * Lightweight HTML heuristics for the "Analyze Website" feature.
 *
 * This is explicitly NOT a Lighthouse/Core Web Vitals audit: we fetch the HTML
 * once and look for evidence we can actually verify (viewport meta, forms,
 * tel:/mailto:/wa.me links, JSON-LD, CTA text, generator tags, copyright year).
 * Every signal carries the exact evidence string it was derived from, and
 * anything we cannot see is reported as `unknown` — never guessed.
 */

import type { AnalysisResult, SocialLink, WebsiteSignal } from '../types';
import { isValidEmail, unique } from '../utils';

export interface HtmlFacts {
  bytes: number;
  doctype: boolean;
  lang: string | null;
  title: string | null;
  metaDescription: string | null;
  viewportPresent: boolean;
  viewportDeviceWidth: boolean;
  h1Count: number;
  formCount: number;
  formEmailInput: boolean;
  formTelInput: boolean;
  formTextarea: boolean;
  formProviders: string[];
  telLinks: string[];
  mailtoLinks: string[];
  whatsappLinks: string[];
  socialLinks: SocialLink[];
  bookingProviders: string[];
  ctaLabels: string[];
  generator: string | null;
  frameworks: string[];
  outdatedHints: string[];
  copyrightYear: number | null;
  scriptSrcCount: number;
  headBlockingScripts: number;
  styleCount: number;
  mediaQueryCount: number;
  imgCount: number;
  imgWithoutAlt: number;
  lazyImages: number;
  jsonLd: Record<string, unknown>[];
  jsonLdEmails: string[];
  jsonLdPhones: string[];
  jsonLdSocial: SocialLink[];
  jsonLdHasAddress: boolean;
  jsonLdHasOpeningHours: boolean;
  textHasAddress: boolean;
  textHasHours: boolean;
  textHasPhone: boolean;
  visibleText: string;
}

const SOCIAL_PLATFORMS: { platform: string; pattern: RegExp }[] = [
  { platform: 'facebook', pattern: /facebook\.com|fb\.com|fb\.me/i },
  { platform: 'instagram', pattern: /instagram\.com/i },
  { platform: 'linkedin', pattern: /linkedin\.com/i },
  { platform: 'x', pattern: /(?:^|\/\/|\.)x\.com|twitter\.com/i },
  { platform: 'youtube', pattern: /youtube\.com|youtu\.be/i },
  { platform: 'whatsapp', pattern: /wa\.me|api\.whatsapp\.com|whatsapp:\/\//i },
];

const BOOKING_PROVIDERS: { name: string; pattern: RegExp }[] = [
  { name: 'Calendly', pattern: /calendly\.com/i },
  { name: 'Cal.com', pattern: /cal\.com/i },
  { name: 'Razorpay', pattern: /razorpay\.com/i },
  { name: 'Zomato', pattern: /zomato\.com/i },
  { name: 'Swiggy', pattern: /swiggy\.com/i },
  { name: 'Fresha', pattern: /fresha\.com/i },
  { name: 'Booksy', pattern: /booksy\.com/i },
  { name: 'Practo', pattern: /practo\.com/i },
  { name: 'Google Reserve', pattern: /reserve\.google\.com|reservewithgoogle/i },
];

const FORM_PROVIDERS: { name: string; pattern: RegExp }[] = [
  { name: 'WPForms', pattern: /wpforms/i },
  { name: 'Contact Form 7', pattern: /wpcf7|contact-form-7/i },
  { name: 'Gravity Forms', pattern: /gform_/i },
  { name: 'HubSpot form', pattern: /hs-form|hubspot/i },
  { name: 'Typeform', pattern: /typeform\.com/i },
  { name: 'Google Forms', pattern: /docs\.google\.com\/forms/i },
  { name: 'Jotform', pattern: /jotform/i },
];

const OUTDATED_HINTS: { hint: string; pattern: RegExp }[] = [
  { hint: '<marquee> element', pattern: /<marquee/i },
  { hint: '<blink> element', pattern: /<blink/i },
  { hint: 'deprecated <font> tags', pattern: /<font\s/i },
  { hint: 'bgcolor table attributes', pattern: /bgcolor=/i },
  { hint: 'Flash (.swf) embed', pattern: /\.swf| ShockwaveFlash/i },
  { hint: 'jQuery 1.x', pattern: /jquery[.-]1\.\d+/i },
  { hint: 'jQuery 2.x', pattern: /jquery[.-]2\.\d+/i },
  { hint: 'Bootstrap 2/3', pattern: /bootstrap[./-](?:2|3)\./i },
  { hint: 'IE compatibility meta', pattern: /http-equiv=["']?X-UA-Compatible/i },
  { hint: 'frameset/iframe-only layout', pattern: /<frameset/i },
  { hint: 'Microsoft FrontPage markup', pattern: /frontpage/i },
];

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tag.match(re);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}

function tags(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  return html.match(re) ?? [];
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function anchorTexts(html: string): string[] {
  const out: string[] = [];
  const re = /<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[2] ?? '');
    if (text && text.length <= 60) out.push(text);
  }
  return out;
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const results: Record<string, unknown>[] = [];
  for (const block of blocks) {
    const inner = block.replace(/<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    if (!inner) continue;
    try {
      const parsed = JSON.parse(decodeEntities(inner));
      if (Array.isArray(parsed)) results.push(...(parsed as Record<string, unknown>[]));
      else if (parsed && typeof parsed === 'object') results.push(parsed as Record<string, unknown>);
    } catch {
      /* invalid JSON-LD — ignore, we simply cannot use it */
    }
  }
  return results;
}

function walkJsonLd(nodes: Record<string, unknown>[], visit: (node: Record<string, unknown>) => void): void {
  for (const node of nodes) {
    visit(node);
    const graph = node['@graph'];
    if (Array.isArray(graph)) walkJsonLd(graph as Record<string, unknown>[], visit);
  }
}

const CTA_PATTERN =
  /\b(book|booking|reserve|reservation|order|buy|purchase|enquir\w*|inquir\w*|quote|get started|contact us|call (us|now)|schedule|appointment|sign up|register|subscribe|chat with|whatsapp)\b/i;

export function extractHtmlFacts(html: string, contentType: string | null): HtmlFacts {
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch?.[1] ?? '';
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch?.[1] ?? html;

  const htmlTag = tags(html, 'html')[0] ?? '';
  const viewportTag = tags(head, 'meta').find((t) => (attr(t, 'name') ?? '').toLowerCase() === 'viewport');
  const viewportContent = viewportTag ? (attr(viewportTag, 'content') ?? '') : '';
  const descriptionTag = tags(head, 'meta').find((t) => {
    const name = (attr(t, 'name') ?? '').toLowerCase();
    return name === 'description' || name === 'og:description';
  });
  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const generatorTag = tags(head, 'meta').find((t) => (attr(t, 'name') ?? '').toLowerCase() === 'generator');

  const links = tags(html, 'a').map((t) => attr(t, 'href') ?? '').filter(Boolean);
  const telLinks = unique(links.filter((h) => h.toLowerCase().startsWith('tel:')));
  const mailtoLinks = unique(links.filter((h) => h.toLowerCase().startsWith('mailto:')).map((h) => h.replace(/^mailto:/i, '').split('?')[0]!));
  const whatsappLinks = unique(links.filter((h) => /wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(h)));

  const socialLinks: SocialLink[] = [];
  for (const href of unique(links.filter((h) => /^https?:\/\//i.test(h)))) {
    for (const { platform, pattern } of SOCIAL_PLATFORMS) {
      if (platform === 'whatsapp') continue;
      if (pattern.test(href)) {
        socialLinks.push({ platform, url: href });
        break;
      }
    }
  }

  const forms = tags(html, 'form');
  const inputs = tags(html, 'input');
  const lower = html.toLowerCase();

  const jsonLd = extractJsonLd(html);
  const jsonLdEmails: string[] = [];
  const jsonLdPhones: string[] = [];
  const jsonLdSocial: SocialLink[] = [];
  let jsonLdHasAddress = false;
  let jsonLdHasOpeningHours = false;
  walkJsonLd(jsonLd, (node) => {
    const email = node.email;
    if (typeof email === 'string' && isValidEmail(email)) jsonLdEmails.push(email);
    const phone = node.telephone ?? node.phone;
    if (typeof phone === 'string') jsonLdPhones.push(phone);
    if (node.address) jsonLdHasAddress = true;
    if (node.openingHours || node.openingHoursSpecification) jsonLdHasOpeningHours = true;
    const sameAs = node.sameAs;
    if (Array.isArray(sameAs)) {
      for (const href of sameAs) {
        if (typeof href !== 'string') continue;
        for (const { platform, pattern } of SOCIAL_PLATFORMS) {
          if (pattern.test(href)) {
            jsonLdSocial.push({ platform, url: href });
            break;
          }
        }
      }
    }
  });

  const visibleText = stripTags(
    body
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' '),
  );

  const copyrightMatch = visibleText.match(/(?:©|\(c\)|copyright)\s*(?:[^0-9]{0,20})?(19|20)(\d{2})/i);
  const copyrightYear = copyrightMatch ? Number.parseInt(`${copyrightMatch[1]}${copyrightMatch[2]}`, 10) : null;

  const frameworks: string[] = [];
  const frameworkHints: { name: string; pattern: RegExp }[] = [
    { name: 'WordPress', pattern: /wp-content|wp-includes/i },
    { name: 'Wix', pattern: /wixstatic|wix\.com/i },
    { name: 'Shopify', pattern: /cdn\.shopify\.com/i },
    { name: 'Squarespace', pattern: /squarespace/i },
    { name: 'GoDaddy Website Builder', pattern: /godaddy\.com\/websites|wsb-css/i },
    { name: 'Next.js', pattern: /__NEXT_DATA__|_next\/static/i },
    { name: 'React', pattern: /data-reactroot|react-dom/i },
    { name: 'Bootstrap', pattern: /bootstrap(?:\.min)?\.css/i },
    { name: 'Tailwind CSS', pattern: /tailwind/i },
    { name: 'Elementor', pattern: /elementor/i },
  ];
  for (const { name, pattern } of frameworkHints) if (pattern.test(html)) frameworks.push(name);

  const outdatedHints = OUTDATED_HINTS.filter((h) => h.pattern.test(html)).map((h) => h.hint);
  if (!viewportTag) outdatedHints.push('no responsive viewport meta');

  const scriptTags = tags(html, 'script');
  const scriptSrcCount = scriptTags.filter((t) => attr(t, 'src')).length;
  const headScripts = tags(head, 'script');
  const headBlockingScripts = headScripts.filter((t) => attr(t, 'src') && !attr(t, 'async') && !attr(t, 'defer')).length;

  const imgTags = tags(html, 'img');
  const styleTags = tags(html, 'style');
  const inlineStyle = styleTags.join(' ');
  const mediaQueryCount = (html.match(/@media\b/gi) ?? []).length;

  return {
    bytes: Buffer.byteLength(html, 'utf8'),
    doctype: /^\s*<!doctype html/i.test(html),
    lang: attr(htmlTag, 'lang'),
    title: titleMatch?.[1] ? decodeEntities(titleMatch[1]).trim() : null,
    metaDescription: descriptionTag ? decodeEntities(attr(descriptionTag, 'content') ?? '').trim() || null : null,
    viewportPresent: Boolean(viewportTag),
    viewportDeviceWidth: /width\s*=\s*device-width/i.test(viewportContent),
    h1Count: tags(html, 'h1').length,
    formCount: forms.length,
    formEmailInput: inputs.some((t) => (attr(t, 'type') ?? '').toLowerCase() === 'email'),
    formTelInput: inputs.some((t) => (attr(t, 'type') ?? '').toLowerCase() === 'tel'),
    formTextarea: tags(html, 'textarea').length > 0,
    formProviders: FORM_PROVIDERS.filter((p) => p.pattern.test(html)).map((p) => p.name),
    telLinks,
    mailtoLinks,
    whatsappLinks,
    socialLinks: unique([...socialLinks, ...jsonLdSocial].map((s) => `${s.platform}|${s.url}`)).map((key) => {
      const [platform, url] = key.split('|');
      return { platform: platform!, url: url! };
    }),
    bookingProviders: BOOKING_PROVIDERS.filter((p) => p.pattern.test(html)).map((p) => p.name),
    ctaLabels: unique(anchorTexts(html).filter((t) => CTA_PATTERN.test(t))).slice(0, 12),
    generator: generatorTag ? decodeEntities(attr(generatorTag, 'content') ?? '').trim() || null : null,
    frameworks: unique(frameworks),
    outdatedHints: unique(outdatedHints),
    copyrightYear,
    scriptSrcCount,
    headBlockingScripts,
    styleCount: styleTags.length,
    mediaQueryCount,
    imgCount: imgTags.length,
    imgWithoutAlt: imgTags.filter((t) => attr(t, 'alt') === null).length,
    lazyImages: imgTags.filter((t) => (attr(t, 'loading') ?? '').toLowerCase() === 'lazy').length,
    jsonLd,
    jsonLdEmails: unique(jsonLdEmails),
    jsonLdPhones: unique(jsonLdPhones),
    jsonLdSocial,
    jsonLdHasAddress,
    jsonLdHasOpeningHours,
    textHasAddress:
      jsonLdHasAddress ||
      /(?:address|location)\s*[:\-]/i.test(visibleText) ||
      (/\b(?:road|street|lane|marg|nagar|chowk|plaza|complex|building|floor|shop)\b/i.test(visibleText) &&
        /\b\d{5,6}\b/.test(visibleText)),
    textHasHours:
      jsonLdHasOpeningHours ||
      /\b(?:opening hours|business hours|timings|we are open|open\s+(?:from|at)|mon(?:day)?\s*[-–:to]+\s*sat|9\s*(?:am|pm)|10\s*(?:am|pm))\b/i.test(
        visibleText,
      ),
    textHasPhone: jsonLdPhones.length > 0 || telLinks.length > 0 || /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,5}\)|\d{3,5})[\s-]?\d{3,4}[\s-]?\d{3,4}/.test(visibleText),
    visibleText: contentType ? visibleText : visibleText,
  };
}

export interface SignalInput {
  facts: HtmlFacts;
  finalUrl: string;
  requestedUrl: string;
  lastModified: string | null;
  httpStatus: number;
  durationMs: number;
}

interface WeightedSignal extends WebsiteSignal {
  weight: number;
  earned: number;
}

function sig(
  key: string,
  label: string,
  result: AnalysisResult,
  detail: string,
  weight: number,
  earned: number,
): WeightedSignal {
  return { key, label, result, detail, weight, earned };
}

const CURRENT_YEAR = new Date().getUTCFullYear();

export function buildSignals(input: SignalInput): { signals: WebsiteSignal[]; siteScore: number } {
  const { facts, finalUrl, requestedUrl, lastModified, httpStatus, durationMs } = input;
  const weighted: WeightedSignal[] = [];

  // 1 — Mobile friendliness (weight 20)
  if (!facts.viewportPresent) {
    weighted.push(
      sig(
        'mobile_viewport',
        'Mobile viewport',
        'fail',
        'No <meta name="viewport"> tag found — the page will render as a desktop layout on phones.',
        20,
        0,
      ),
    );
  } else if (!facts.viewportDeviceWidth) {
    weighted.push(
      sig(
        'mobile_viewport',
        'Mobile viewport',
        'warn',
        'A viewport meta tag exists but does not set width=device-width.',
        20,
        10,
      ),
    );
  } else {
    weighted.push(
      sig(
        'mobile_viewport',
        'Mobile viewport',
        'pass',
        `<meta name="viewport"> with width=device-width detected${facts.mediaQueryCount > 0 ? `, plus ${facts.mediaQueryCount} CSS @media rule(s)` : ''}.`,
        20,
        20,
      ),
    );
  }

  // 2 — HTTPS (weight 10)
  weighted.push(
    finalUrl.startsWith('https://')
      ? sig('https', 'HTTPS', 'pass', 'Page served over HTTPS.', 10, 10)
      : sig(
          'https',
          'HTTPS',
          'fail',
          `Page served over plain HTTP (${finalUrl}) — browsers flag this as "not secure", which hurts trust and form submissions.`,
          10,
          0,
        ),
  );

  // 3 — Call to action (weight 15)
  const ctaCount = facts.ctaLabels.length;
  weighted.push(
    ctaCount === 0
      ? sig('cta', 'Visible call-to-action', 'fail', 'No action-oriented button/link text found (e.g. "Book", "Enquire", "Get a quote").', 15, 0)
      : ctaCount < 3
        ? sig('cta', 'Visible call-to-action', 'warn', `Only ${ctaCount} CTA-like link(s) detected: "${facts.ctaLabels.join('", "')}".`, 15, 10)
        : sig('cta', 'Visible call-to-action', 'pass', `${ctaCount} CTA-like links detected (e.g. "${facts.ctaLabels[0]}").`, 15, 15),
  );

  // 4 — Enquiry form (weight 15)
  if (facts.formCount === 0) {
    weighted.push(
      sig('enquiry_form', 'Enquiry form', 'fail', 'No <form> element found in the HTML — visitors cannot submit an enquiry on the page.', 15, 0),
    );
  } else {
    const detail = `${facts.formCount} form(s) found${facts.formProviders.length ? ` (${facts.formProviders.join(', ')})` : ''}${
      facts.formEmailInput ? ' with an email field' : ''
    }${facts.formTelInput ? ' and a phone field' : ''}.`;
    weighted.push(
      sig('enquiry_form', 'Enquiry form', facts.formEmailInput || facts.formTelInput ? 'pass' : 'warn', detail, 15, facts.formEmailInput || facts.formTelInput ? 15 : 9),
    );
  }

  // 5 — Direct contact flow (weight 10): tel + mailto + whatsapp, thirds
  const contactBits: string[] = [];
  let contactEarned = 0;
  if (facts.telLinks.length > 0) {
    contactEarned += 3.34;
    contactBits.push(`${facts.telLinks.length} tel: click-to-call link(s)`);
  }
  if (facts.mailtoLinks.length > 0) {
    contactEarned += 3.33;
    contactBits.push(`${facts.mailtoLinks.length} mailto: link(s)`);
  }
  if (facts.whatsappLinks.length > 0) {
    contactEarned += 3.33;
    contactBits.push(`${facts.whatsappLinks.length} WhatsApp (wa.me) link(s)`);
  }
  if (facts.bookingProviders.length > 0) contactBits.push(`booking/payment integration: ${facts.bookingProviders.join(', ')}`);
  weighted.push(
    sig(
      'contact_flow',
      'Direct contact flow (call / email / WhatsApp)',
      contactBits.length === 0 ? 'fail' : contactEarned >= 9.9 ? 'pass' : 'warn',
      contactBits.length === 0
        ? 'No tel:, mailto: or wa.me links found — visitors must copy a number manually, if one is shown at all.'
        : `Detected ${contactBits.join('; ')}.`,
      10,
      Math.round(contactEarned),
    ),
  );

  // 6 — SEO basics (weight 10)
  const titleOk = Boolean(facts.title && facts.title.length >= 10 && facts.title.length <= 70);
  const descOk = Boolean(facts.metaDescription && facts.metaDescription.length >= 70 && facts.metaDescription.length <= 200);
  const seoEarned = (titleOk ? 5 : 0) + (descOk ? 5 : 0);
  weighted.push(
    sig(
      'seo_basics',
      'Search basics (title + meta description)',
      seoEarned === 10 ? 'pass' : seoEarned === 0 ? 'fail' : 'warn',
      `Title: ${facts.title ? `"${facts.title}" (${facts.title.length} chars)` : 'missing'}. Meta description: ${
        facts.metaDescription ? `${facts.metaDescription.length} chars` : 'missing'
      }.`,
      10,
      seoEarned,
    ),
  );

  // 7 — Heading structure (weight 5)
  weighted.push(
    facts.h1Count === 1
      ? sig('h1', 'Heading structure', 'pass', 'Exactly one <h1> found.', 5, 5)
      : facts.h1Count === 0
        ? sig('h1', 'Heading structure', 'fail', 'No <h1> found — search engines cannot read the page topic.', 5, 0)
        : sig('h1', 'Heading structure', 'warn', `${facts.h1Count} <h1> elements found (expected exactly one).`, 5, 2),
  );

  // 8 — Freshness (weight 10)
  const lastModifiedYear = lastModified ? new Date(lastModified).getUTCFullYear() : null;
  const newestYear = Math.max(facts.copyrightYear ?? 0, lastModifiedYear ?? 0);
  if (newestYear === 0) {
    weighted.push(
      sig(
        'freshness',
        'Content freshness',
        'unknown',
        'No copyright year in the visible text and no Last-Modified header — publish date cannot be verified.',
        10,
        5,
      ),
    );
  } else if (CURRENT_YEAR - newestYear >= 4) {
    weighted.push(
      sig(
        'freshness',
        'Content freshness',
        'fail',
        `Newest date evidence on the page is ${newestYear}${facts.copyrightYear === newestYear ? ' (copyright line)' : ' (Last-Modified header)'} — ${
          CURRENT_YEAR - newestYear
        } years old.`,
        10,
        0,
      ),
    );
  } else if (CURRENT_YEAR - newestYear >= 2) {
    weighted.push(
      sig('freshness', 'Content freshness', 'warn', `Newest date evidence is ${newestYear}.`, 10, 5),
    );
  } else {
    weighted.push(sig('freshness', 'Content freshness', 'pass', `Newest date evidence is ${newestYear}.`, 10, 10));
  }

  // 9 — Modern stack / obvious age markers (weight 5)
  const ageMarkers = facts.outdatedHints;
  weighted.push(
    ageMarkers.length === 0
      ? sig(
          'stack',
          'Design/stack age markers',
          'pass',
          `No obvious legacy markers found${facts.frameworks.length ? ` (detected: ${facts.frameworks.join(', ')})` : ''}.`,
          5,
          5,
        )
      : sig(
          'stack',
          'Design/stack age markers',
          'fail',
          `Legacy markers found: ${ageMarkers.join(', ')}.`,
          5,
          0,
        ),
  );

  // Extra, non-weighted observations (still evidence-based)
  const info: WeightedSignal[] = [];
  info.push(
    sig(
      'business_info',
      'Key business information on page',
      facts.textHasAddress && facts.textHasHours && facts.textHasPhone
        ? 'pass'
        : facts.textHasAddress || facts.textHasHours || facts.textHasPhone
          ? 'warn'
          : 'fail',
      `Address ${facts.textHasAddress ? 'found' : 'not found'}, opening hours ${
        facts.textHasHours ? 'found' : 'not found'
      }, phone ${facts.textHasPhone ? 'found' : 'not found'}${facts.jsonLd.length ? `; ${facts.jsonLd.length} JSON-LD block(s) parsed` : ''}.`,
      0,
      0,
    ),
  );
  info.push(
    sig(
      'page_weight',
      'Page weight & blocking resources (heuristic)',
      facts.bytes > 600_000 || facts.headBlockingScripts > 6 ? 'warn' : 'pass',
      `HTML ${Math.round(facts.bytes / 1024)} KB, ${facts.scriptSrcCount} external script(s), ${
        facts.headBlockingScripts
      } render-blocking script(s) in <head>, ${facts.imgCount} image(s)${
        facts.imgWithoutAlt ? ` of which ${facts.imgWithoutAlt} lack alt text` : ''
      }, ${facts.lazyImages} lazy-loaded. Fetched in ${durationMs} ms (HTTP ${httpStatus}).`,
      0,
      0,
    ),
  );
  if (facts.lang === null) {
    info.push(sig('lang', 'Language declaration', 'warn', 'No lang attribute on <html> — hurts accessibility and local SEO.', 0, 0));
  }
  if (finalUrl !== requestedUrl) {
    info.push(sig('redirect', 'Redirects', 'warn', `Request was redirected to ${finalUrl}.`, 0, 0));
  }
  if (facts.socialLinks.length > 0) {
    info.push(
      sig(
        'social',
        'Social profiles linked from the site',
        'pass',
        unique(facts.socialLinks.map((s) => s.platform)).join(', '),
        0,
        0,
      ),
    );
  }

  const total = weighted.reduce((sum, s) => sum + s.weight, 0);
  const earned = weighted.reduce((sum, s) => sum + s.earned, 0);
  const siteScore = total > 0 ? Math.round((earned / total) * 100) : 0;

  return { signals: [...weighted, ...info].map(({ weight: _w, earned: _e, ...rest }) => rest), siteScore };
}

export function qualityForScore(siteScore: number): 'weak' | 'moderate' | 'strong' {
  if (siteScore >= 75) return 'strong';
  if (siteScore >= 50) return 'moderate';
  return 'weak';
}
