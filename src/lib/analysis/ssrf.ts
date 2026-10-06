/**
 * SSRF guard for the (optional) website analysis fetch.
 *
 * We only ever fetch public http(s) business websites, never internal
 * addresses, and we always resolve DNS first to reject private ranges.
 * Known limitation (documented in the README): a DNS-rebinding attack between
 * our lookup and the fetch is not fully mitigated in V1 — run this behind an
 * egress proxy if that matters for your threat model.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function v4ToLong(ip: string): number {
  return ip.split('.').reduce((acc, part) => acc * 256 + Number.parseInt(part, 10), 0);
}

export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const long = v4ToLong(ip);
    const inRange = (cidr: string) => {
      const [base, bitsRaw] = cidr.split('/');
      const bits = Number.parseInt(bitsRaw ?? '32', 10);
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (long & mask) === (v4ToLong(base!) & mask);
    };
    return [
      '0.0.0.0/8',
      '10.0.0.0/8',
      '100.64.0.0/10',
      '127.0.0.0/8',
      '169.254.0.0/16',
      '172.16.0.0/12',
      '192.0.0.0/24',
      '192.0.2.0/24',
      '192.168.0.0/16',
      '198.18.0.0/15',
      '198.51.100.0/24',
      '203.0.113.0/24',
      '224.0.0.0/4',
      '240.0.0.0/4',
      '255.255.255.255/32',
    ].some(inRange);
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
      return true; // link local
    }
    if (lower.startsWith('ff')) return true; // multicast
    return false;
  }
  return true; // not an IP literal → treat as unsafe here
}

export interface SafeUrl {
  url: URL;
  resolvedAddresses: string[];
}

/**
 * Validates scheme + resolves DNS + rejects private/loopback/link-local targets.
 * `allowPrivate` is a testing-only escape hatch (WEBSITE_ANALYSIS_ALLOW_PRIVATE)
 * and must stay off in any deployment that is reachable by other people.
 */
export async function assertSafeUrl(raw: string, opts: { allowPrivate?: boolean } = {}): Promise<SafeUrl> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Malformed URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Unsupported protocol "${url.protocol}" — only http and https are allowed.`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Credentials in the URL are not allowed.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const resolvedAddresses: string[] = [];

  if (net.isIP(hostname)) {
    if (!opts.allowPrivate && isPrivateIp(hostname)) {
      throw new UnsafeUrlError('Requests to private/internal IP addresses are blocked.');
    }
    resolvedAddresses.push(hostname);
  } else {
    let records: { address: string }[] = [];
    try {
      records = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch (err) {
      throw new UnsafeUrlError(
        `Could not resolve ${hostname} (${err instanceof Error ? err.message : 'DNS error'}).`,
      );
    }
    if (records.length === 0) throw new UnsafeUrlError(`No DNS records for ${hostname}.`);
    for (const record of records) {
      if (!opts.allowPrivate && isPrivateIp(record.address)) {
        throw new UnsafeUrlError(`${hostname} resolves to a private/internal address — blocked.`);
      }
      resolvedAddresses.push(record.address);
    }
  }

  return { url, resolvedAddresses };
}
