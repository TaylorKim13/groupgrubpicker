import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mapsFetch } from '../src/lib/maps.server.ts';
import { publicOrigin } from '../src/lib/public-origin.server.ts';

test('startup fails clearly without private backend settings and prints no values', () => {
  const env = { ...process.env };
  for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete env[key];
  const result = spawnSync(process.execPath, ['scripts/start-render.mjs'], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('Render origin overrides an internal proxy HTTP address', () => {
  const before = { PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL, RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL };
  try {
    delete process.env.PUBLIC_SITE_URL;
    process.env.RENDER_EXTERNAL_URL = 'https://groupgrub-team.onrender.com';
    assert.equal(publicOrigin(new Request('http://internal:10000/wait?name=Test&minutes=2')), 'https://groupgrub-team.onrender.com');
    process.env.PUBLIC_SITE_URL = 'https://eat.example.com/';
    assert.equal(publicOrigin(new Request('http://internal/')), 'https://eat.example.com');
    process.env.PUBLIC_SITE_URL = 'http://example.com';
    assert.throws(() => publicOrigin(new Request('http://internal/')), /HTTPS/);
  } finally {
    for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('Google requests use direct APIs or the existing gateway without exposing keys to callers', async () => {
  const originalFetch = globalThis.fetch;
  const before = { GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY, LOVABLE_API_KEY: process.env.LOVABLE_API_KEY };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: new URL(url), headers: new Headers(options.headers) });
    return Response.json({ results: [] });
  };
  try {
    process.env.GOOGLE_MAPS_API_KEY = 'server-test-key';
    delete process.env.LOVABLE_API_KEY;
    await mapsFetch('/maps/api/geocode/json?address=Provo');
    assert.equal(requests[0].url.hostname, 'maps.googleapis.com');
    assert.equal(requests[0].url.searchParams.get('key'), 'server-test-key');
    await mapsFetch('/places/v1/places:searchText', { method: 'POST', fieldMask: 'places.id', body: '{}' });
    assert.equal(requests[1].url.href, 'https://places.googleapis.com/v1/places:searchText');
    assert.equal(requests[1].headers.get('X-Goog-Api-Key'), 'server-test-key');
    assert.equal(requests[1].headers.get('X-Goog-FieldMask'), 'places.id');
    process.env.LOVABLE_API_KEY = 'gateway-test-key';
    await mapsFetch('/maps/api/geocode/json?address=Provo');
    assert.equal(requests[2].url.pathname, '/google_maps/maps/api/geocode/json');
    assert.equal(requests[2].headers.get('Authorization'), 'Bearer gateway-test-key');
    delete process.env.GOOGLE_MAPS_API_KEY;
    await assert.rejects(mapsFetch('/maps/api/geocode/json'), /not connected/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
