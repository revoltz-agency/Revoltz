import test from 'node:test';
import assert from 'node:assert/strict';
import { isMapsScraperJobId, normalizeMapsScraperCsv, parseMapsScraperCsv } from '../server/mapsScraper.js';

test('parses quoted commas and escaped quotes from scraper CSV', () => {
  const rows = parseMapsScraperCsv('title,address,phone\r\n"Clinic, West","12 ""Main"" Road",12345\r\n');
  assert.equal(rows[0].title, 'Clinic, West');
  assert.equal(rows[0].address, '12 "Main" Road');
});

test('normalizes and deduplicates Maps scraper results with a result limit', () => {
  const csv = [
    'title,category,address,phone,website,review_rating,review_count,place_id,link',
    'Clinic One,Dentist,"Pune, Maharashtra",9876543210,https://clinic.example,4.5,120,abc,https://maps.google.com/?cid=abc',
    'Clinic One,Dentist,"Pune, Maharashtra",9876543210,https://clinic.example,4.5,120,abc,https://maps.google.com/?cid=abc',
    'Clinic Two,Dentist,Pune,,,,,def,https://maps.google.com/?cid=def',
  ].join('\n');
  const leads = normalizeMapsScraperCsv(csv, { category: 'dentists', location: 'Pune', maxResults: 1 });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].source, 'maps-scraper');
  assert.equal(leads[0].name, 'Clinic One');
  assert.equal(leads[0].rating, 4.5);
  assert.equal(leads[0].reviews, 120);
  assert.equal(leads[0].placeId, 'abc');
});

test('validates scraper job IDs before making upstream requests', () => {
  assert.equal(isMapsScraperJobId('6f0c1af8-3c4e-4742-84bb-590938ae8930'), true);
  assert.equal(isMapsScraperJobId('https://evil.example'), false);
});
