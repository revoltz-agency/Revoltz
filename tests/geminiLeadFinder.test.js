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

test('Gemini leads must match a Maps grounding result and use its canonical identity and URL', async () => {
  const stub = stubGemini({ candidates: [{
    content: { parts: [{ text: JSON.stringify({ leads: [generatedLead, { ...generatedLead, name: 'Invented Cafe' }] }) }] },
    groundingMetadata: { groundingChunks: [{ maps: {
      title: 'Café Aurora', uri: 'https://maps.google.com/?cid=123', placeId: 'places/ChIJverified',
    } }] },
  }] });
  try {
    const result = await searchGeminiLeads({ apiKey: 'user-key', category: 'cafes', location: 'Pune', maxResults: 10 });
    assert.equal(stub.requestBody.tools[0].googleMaps !== undefined, true);
    assert.equal(result.leads.length, 1);
    assert.equal(result.leads[0].name, 'Café Aurora');
    assert.equal(result.leads[0].placeId, 'ChIJverified');
    assert.equal(result.leads[0].id, 'gemini-ChIJverified');
    assert.equal(result.leads[0].mapsUrl, 'https://maps.google.com/?cid=123');
    assert.equal(result.leads[0].phone, '');
    assert.equal(result.leads[0].website, '');
    assert.equal(result.leads[0].rating, null);
    assert.equal(result.leads[0].reviews, 0);
    assert.equal(result.groundingSources[0].name, 'Café Aurora');
  } finally { stub.restore(); }
});

test('Gemini search refuses to return model-suggested businesses without Maps sources', async () => {
  const stub = stubGemini({ candidates: [{ content: { parts: [{ text: JSON.stringify({ leads: [generatedLead] }) }] } }] });
  try {
    await assert.rejects(
      searchGeminiLeads({ apiKey: 'user-key', category: 'cafes', location: 'Pune' }),
      /did not return any Google Maps business sources/,
    );
  } finally { stub.restore(); }
});
