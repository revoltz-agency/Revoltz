import test from 'node:test';
import assert from 'node:assert/strict';
import { searchGeminiLeads } from '../src/lib/geminiLeadFinder.js';

const generatedLead = {
  name: 'Cafe Aurora', category: 'Cafes', city: 'Pune', address: 'Made-up address',
  phone: '+91 99999 99999', website: 'https://made-up.example', mapsUrl: 'https://made-up.example/maps',
  rating: 4.9, reviews: 999, placeId: 'invented-place-id',
};

function stubGemini(payload) {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => payload };
  };
  return { restore: () => { globalThis.fetch = originalFetch; }, get requestBody() { return requestBody; } };
}

test('Gemini text lead suggestions use standard generation without paid Maps grounding', async () => {
  const stub = stubGemini({ candidates: [{
    content: { parts: [{ text: JSON.stringify({ leads: [generatedLead] }) }] },
  }] });
  try {
    const result = await searchGeminiLeads({ apiKey: 'user-key', category: 'cafes', location: 'Pune', maxResults: 10 });
    assert.equal(stub.requestBody.tools, undefined);
    assert.equal(stub.requestBody.generationConfig.responseMimeType, 'application/json');
    assert.equal(result.leads.length, 1);
    assert.equal(result.leads[0].name, 'Cafe Aurora');
    assert.equal(result.leads[0].source, 'gemini');
    assert.equal(result.leads[0].verificationStatus, 'unverified');
    assert.equal(result.leads[0].placeId, '');
    assert.equal(result.leads[0].phone, '+91 99999 99999');
    assert.equal(result.leads[0].mapsUrl, 'https://made-up.example/maps');
    assert.equal(result.groundingSources.length, 1);
  } finally { stub.restore(); }
});

test('Gemini text lead suggestions can return an empty list without fabricating records', async () => {
  const stub = stubGemini({ candidates: [{ content: { parts: [{ text: JSON.stringify({ leads: [] }) }] } }] });
  try {
    const result = await searchGeminiLeads({ apiKey: 'user-key', category: 'cafes', location: 'Pune' });
    assert.deepEqual(result.leads, []);
  } finally { stub.restore(); }
});
