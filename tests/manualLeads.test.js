import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyManualLeadOverride,
  applyManualLeadUpdate,
  createManualLead,
  findManualLeadDuplicate,
  manualLeadSourceLabel,
  normalizeGoogleMapsUrl,
  normalizeLeadName,
  normalizeLeadPhone,
  normalizeWebsiteDomain,
  parseCsv,
  parseManualLeadCsv,
  validateManualLead,
} from '../src/lib/manualLeads.js';

const requiredInput = { name: 'Harbor & Hearth', category: 'Cafe', city: 'Pune' };

test('manual lead validation requires name, industry, and city while optional details can be omitted', () => {
  const valid = validateManualLead(requiredInput);
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
  assert.equal(valid.values.website, '');
  assert.equal(valid.values.phone, '');
  assert.equal(valid.values.email, '');
  assert.equal(validateManualLead({ ...requiredInput, website: 'javascript:alert(1)' }).valid, false);
  assert.match(validateManualLead({ ...requiredInput, email: 'not-an-email' }).errors.email, /valid email/i);
  assert.match(validateManualLead({ ...requiredInput, rating: '5.1' }).errors.rating, /0 to 5/i);
  assert.match(validateManualLead({ ...requiredInput, reviews: '3.5' }).errors.reviews, /whole number/i);
  assert.equal(validateManualLead({ name: '', category: '', city: '' }).valid, false);
});

test('manual lead creation is local-only and stores CRM email and notes as unverified user data', () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error('unexpected network request'); };
  try {
    const lead = createManualLead({
      ...requiredInput,
      phone: '+91 98765 43210',
      email: 'owner@example.com',
      notes: 'Met at an event',
    }, { id: 'manual-test-1' });
    assert.equal(networkCalls, 0);
    assert.equal(lead.id, 'manual-test-1');
    assert.equal(lead.source, 'manual');
    assert.equal(lead.businessStatus, 'UNKNOWN');
    assert.equal(lead.initialCRM.email, 'owner@example.com');
    assert.equal(lead.initialCRM.notes, 'Met at an event');
    assert.equal(lead.initialCRM.emailVerifiedByUser, undefined);
    assert.equal(lead.placeId, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('source labels distinguish Manual, Google Places, and Demo', () => {
  assert.equal(manualLeadSourceLabel({ source: 'manual' }), 'Manual');
  assert.equal(manualLeadSourceLabel({ source: 'google' }), 'Google Places');
  assert.equal(manualLeadSourceLabel({ source: 'demo' }), 'Demo');
});

test('manual updates preserve the existing source and known optional values when blanks are imported', () => {
  const existing = {
    id: 'place-22', placeId: 'place-22', source: 'google', name: 'Old name', category: 'Cafe', city: 'Pune',
    website: 'https://existing.example', phone: '+91 98765 43210', rating: 4.2, reviews: 42,
  };
  const updated = applyManualLeadUpdate(existing, { name: 'Updated Cafe', category: 'Coffee shop', city: 'Pune' });
  assert.equal(updated.source, 'google');
  assert.equal(updated.name, 'Updated Cafe');
  assert.equal(updated.website, existing.website);
  assert.equal(updated.phone, existing.phone);
  assert.deepEqual(updated.manualUserFields.sort(), ['category', 'city', 'name']);
  const correctedPhone = applyManualLeadUpdate(existing, { name: 'Updated Cafe', category: 'Coffee shop', city: 'Pune', phone: '020 1234 5678' });
  assert.equal(correctedPhone.phone, '020 1234 5678');
  assert.equal(correctedPhone.internationalPhoneNumber, '');
});

test('persisted user-entered overrides keep Google source attribution and replace stale contact numbers', () => {
  const lead = { id: 'place-77', placeId: 'place-77', source: 'google', phone: '+91 11111 11111', internationalPhoneNumber: '+91 11111 11111' };
  const updated = applyManualLeadOverride(lead, { 'place-77': { phone: '020 1234 5678', city: 'Pune' } });
  assert.equal(updated.source, 'google');
  assert.equal(updated.phone, '020 1234 5678');
  assert.equal(updated.internationalPhoneNumber, '');
  assert.deepEqual(updated.manualUserFields.sort(), ['city', 'phone']);
});

test('duplicate detection normalizes Google Maps URLs, website domains, phone numbers, and name plus city', () => {
  const leads = [
    { id: 'maps-1', source: 'google', mapsUrl: 'https://www.google.com/maps/place/Harbor/@18.5,73.8,17z?entry=ttu&hl=en' },
    { id: 'domain-1', source: 'manual', website: 'http://www.example.co.in/about' },
    { id: 'phone-1', source: 'google', phone: '+91 (98765) 43210' },
    { id: 'name-1', source: 'manual', name: 'Café & Co.', city: 'Púnè' },
  ];
  const maps = findManualLeadDuplicate({ ...requiredInput, mapsUrl: 'https://www.google.com/maps/place/Harbor/@18.5,73.8,17z?hl=fr&entry=abc' }, leads);
  assert.equal(maps.leadId, 'maps-1');
  assert.equal(maps.matchType, 'mapsUrl');
  assert.equal(maps.reason, 'Google Maps URL');

  const domain = findManualLeadDuplicate({ ...requiredInput, website: 'https://example.co.in/contact' }, leads);
  assert.equal(domain.leadId, 'domain-1');
  assert.equal(domain.matchType, 'domain');
  assert.equal(normalizeWebsiteDomain('https://shop.example.co.in/page'), 'example.co.in');

  const phone = findManualLeadDuplicate({ ...requiredInput, phone: '+91-98765-43210' }, leads);
  assert.equal(phone.leadId, 'phone-1');
  assert.equal(phone.matchType, 'phone');
  assert.equal(normalizeLeadPhone('(+91) 098765 43210'), '9109876543210');

  const business = findManualLeadDuplicate({ name: 'Cafe and Co', category: 'Cafe', city: 'Pune' }, leads);
  assert.equal(business.leadId, 'name-1');
  assert.equal(business.matchType, 'name-city');
  const addressCity = findManualLeadDuplicate({ name: 'Harbor & Hearth', category: 'Cafe', city: 'Pune' }, [
    { id: 'google-address', source: 'google', name: 'Harbor & Hearth', city: '', address: 'Koregaon Park, Pune, Maharashtra' },
  ]);
  assert.equal(addressCity.leadId, 'google-address');
  assert.equal(normalizeLeadName('Café & Co.'), 'cafe and co');
});

test('Google Maps URL normalization drops common tracking parameters', () => {
  assert.equal(
    normalizeGoogleMapsUrl('https://www.google.com/maps/place/Test/?entry=ttu&hl=en&q=Pune'),
    normalizeGoogleMapsUrl('https://google.com/maps/place/test?q=pune&entry=other'),
  );
});

test('CSV parser supports BOM, quoted commas, escaped quotes, and multiline cells', () => {
  const csv = '\uFEFFBusiness Name,Industry,City,Notes\r\n"Harbor, Hearth",Cafe,Pune,"Owner said ""call next week""\nAfter lunch"';
  const parsed = parseManualLeadCsv(csv);
  assert.equal(parsed.error, '');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].valid, true);
  assert.equal(parsed.rows[0].values.name, 'Harbor, Hearth');
  assert.equal(parsed.rows[0].values.notes, 'Owner said "call next week"\nAfter lunch');
  assert.equal(parsed.rows[0].rowNumber, 2);
  assert.equal(parseCsv('Name,Industry,City\n"broken,Cafe,Pune').error, 'CSV contains an unclosed quoted field.');
});

test('CSV import maps headers, validates each row, and reports missing required columns', () => {
  const csv = [
    'Business Name,Industry,City,Website,Phone,Email,Google Maps URL,Address,Rating,Review Count,Instagram,Facebook,Notes',
    'North Star,Cafe,Pune,northstar.example,+91 98765 43210,hello@northstar.example,https://maps.google.com/?q=northstar,"Koregaon Park, Pune",4.7,120,https://instagram.com/northstar,https://facebook.com/northstar,"Ask for Priya, weekdays"',
    'Missing City,Salon,,javascript:alert(1),123,wrong-email,,,,,,,',
  ].join('\r\n');
  const parsed = parseManualLeadCsv(csv);
  assert.equal(parsed.error, '');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].valid, true);
  assert.equal(parsed.rows[0].values.website, 'https://northstar.example/');
  assert.equal(parsed.rows[0].values.mapsUrl, 'https://maps.google.com/?q=northstar');
  assert.equal(parsed.rows[0].values.reviews, '120');
  assert.equal(parsed.rows[0].values.address, 'Koregaon Park, Pune');
  assert.equal(parsed.rows[0].values.notes, 'Ask for Priya, weekdays');
  assert.equal(parsed.rows[1].valid, false);
  assert.ok(parsed.rows[1].errors.city);
  assert.ok(parsed.rows[1].errors.website);
  assert.ok(parsed.rows[1].errors.email);
  assert.match(parseManualLeadCsv('Name,Website\nShop,https://shop.example').error, /Industry, City/);
});
