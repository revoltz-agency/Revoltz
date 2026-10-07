import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtmlSignals, auditWebsite } from '../server/websiteAudit.js';

test('HTML analysis reports only signals present in the supplied markup', () => {
  const html = '<html><head><title>Sample</title><meta name="viewport" content="width=device-width"></head><body><a href="/contact">Contact us</a><a href="https://instagram.com/sample">Instagram</a><address>Example</address></body></html>';
  const audit = analyzeHtmlSignals(html, 'https://public.example/');
  assert.equal(audit.mobileViewportDetected, true);
  assert.equal(audit.ctaDetected, true);
  assert.equal(audit.contactFlowDetected, true);
  assert.equal(audit.whatsappFlowDetected, false);
  assert.equal(audit.onlineOrderingDetected, false);
  assert.equal(audit.structuredContactInfoDetected, true);
  assert.equal(audit.titleDetected, true);
  assert.equal(audit.visualDesignAssessed, false);
  assert.equal(audit.weakWebsite, false);
  assert.equal(audit.socialLinks.length, 1);
});

test('WhatsApp entry points count as contact flow when present in the source', () => {
  const audit = analyzeHtmlSignals('<html><body><a href="https://wa.me/12345678901">WhatsApp</a></body></html>', 'https://public.example/');
  assert.equal(audit.whatsappFlowDetected, true);
  assert.equal(audit.contactFlowDetected, true);
});

test('online ordering signal is based only on public link text or URL in the markup', () => {
  const audit = analyzeHtmlSignals('<a href="/order-online">Order online</a>', 'https://public.example/');
  assert.equal(audit.onlineOrderingDetected, true);
  const noOrderingLink = analyzeHtmlSignals('<p>Call to learn more about delivery</p>', 'https://public.example/');
  assert.equal(noOrderingLink.onlineOrderingDetected, false);
});

test('website audit rejects loopback targets before fetching', async () => {
  await assert.rejects(auditWebsite('http://127.0.0.1'), /public address/);
  await assert.rejects(auditWebsite('file:///etc/passwd'), /HTTP or HTTPS/);
});
