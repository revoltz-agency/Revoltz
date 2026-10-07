import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateCachedRequest } from '../src/lib/placeDetailsCache.js';

test('saved place Details request is made at most once per place ID per session', async () => {
  const cache = new Map();
  let calls = 0;
  const fetchDetails = async () => { calls += 1; return { name: 'Current listing' }; };
  const [first, second] = await Promise.all([
    getOrCreateCachedRequest(cache, 'place-1', fetchDetails),
    getOrCreateCachedRequest(cache, 'place-1', fetchDetails),
  ]);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal((await getOrCreateCachedRequest(cache, 'place-1', fetchDetails)).name, 'Current listing');
  assert.equal(calls, 1);
});

test('failed saved-place refresh remains cached for the app session', async () => {
  const cache = new Map();
  let calls = 0;
  const fetchDetails = async () => { calls += 1; throw new Error('quota'); };
  await assert.rejects(getOrCreateCachedRequest(cache, 'place-2', fetchDetails), /quota/);
  await assert.rejects(getOrCreateCachedRequest(cache, 'place-2', fetchDetails), /quota/);
  assert.equal(calls, 1);
});
