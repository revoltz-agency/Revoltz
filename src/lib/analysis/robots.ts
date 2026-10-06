/**
 * Minimal robots.txt reader.
 *
 * We respect robots.txt before any analysis fetch. If a site disallows the
 * path (or our user agent), we do not fetch it and we report that honestly —
 * the lead's score then shows the affected factors as "unknown".
 */

export interface RobotsResult {
  allowed: boolean;
  fetched: boolean;
  status: number | null;
  reason: string;
  matchedRule: string | null;
}

interface Rule {
  type: 'allow' | 'disallow';
  path: string;
}

function parseGroups(text: string): Record<string, Rule[]> {
  const groups: Record<string, Rule[]> = {};
  let current: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      current = current.length ? current : [];
      current.push(value.toLowerCase());
      if (!groups[value.toLowerCase()]) groups[value.toLowerCase()] = [];
    } else if ((field === 'disallow' || field === 'allow') && current.length) {
      for (const agent of current) {
        groups[agent] = groups[agent] ?? [];
        groups[agent]!.push({ type: field as 'allow' | 'disallow', path: value });
      }
    } else if (field !== 'user-agent') {
      current = [];
    }
  }
  return groups;
}

function pathMatches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  // robots.txt supports trailing "*" wildcards and a "$" end anchor.
  const regexSource = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\$$/, '§END§');
  const source = regexSource.includes('§END§')
    ? `^${regexSource.replace('§END§', '')}$`
    : `^${regexSource}`;
  try {
    return new RegExp(source).test(path);
  } catch {
    return path.startsWith(pattern);
  }
}

function evaluate(rules: Rule[], path: string): { allowed: boolean; matchedRule: string | null } {
  let best: { rule: Rule; specificity: number } | null = null;
  for (const rule of rules) {
    if (!rule.path) continue; // "Disallow:" (empty) means allow everything
    if (!pathMatches(rule.path, path)) continue;
    const specificity = rule.path.length + (rule.type === 'allow' ? 0.5 : 0);
    if (!best || specificity > best.specificity) best = { rule, specificity };
  }
  if (!best) return { allowed: true, matchedRule: null };
  return { allowed: best.rule.type === 'allow', matchedRule: `${best.rule.type}: ${best.rule.path}` };
}

export async function checkRobots(
  origin: string,
  path: string,
  userAgent: string,
  timeoutMs: number,
): Promise<RobotsResult> {
  const token = userAgent.split('/')[0]?.trim().toLowerCase() || '*';
  try {
    const res = await fetch(new URL('/robots.txt', origin).toString(), {
      headers: { 'User-Agent': userAgent, Accept: 'text/plain' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        allowed: true,
        fetched: false,
        status: res.status,
        reason: `robots.txt returned HTTP ${res.status} — no crawl restrictions published, proceeding.`,
        matchedRule: null,
      };
    }
    const text = (await res.text()).slice(0, 64 * 1024);
    const groups = parseGroups(text);
    const rules = groups[token] ?? groups['*'] ?? [];
    const verdict = evaluate(rules, path || '/');
    return {
      allowed: verdict.allowed,
      fetched: true,
      status: res.status,
      reason: verdict.allowed
        ? `robots.txt permits crawling "${path || '/'}" for ${token}.`
        : `robots.txt disallows "${path || '/'}" for ${token} — page not fetched.`,
      matchedRule: verdict.matchedRule,
    };
  } catch (err) {
    return {
      allowed: false,
      fetched: false,
      status: null,
      reason: `Could not read robots.txt (${err instanceof Error ? err.message : 'network error'}) — fetch skipped to stay on the safe side.`,
      matchedRule: null,
    };
  }
}
