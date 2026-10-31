/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests load TypeScript through the test bootstrap. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
require('../tests-setup.cjs');

// server-only throws outside a React Server build; these helpers don't need it.
const load = Module._load;
Module._load = function (request, ...rest) {
  return request === 'server-only' ? {} : load.call(this, request, ...rest);
};
const dns = require('node:dns/promises');
const { fetchPublic, PrivateAddressError } = require('../src/lib/publicFetch.ts');

async function withNetwork(addresses, responses, fn) {
  const lookup = dns.lookup;
  const fetch = global.fetch;
  const visited = [];
  dns.lookup = async (host) => [{ address: addresses[host] ?? '192.0.2.10', family: 4 }];
  global.fetch = async (url) => {
    visited.push(url);
    return responses[url] ?? new Response('ok', { status: 200 });
  };
  try {
    return await fn(visited);
  } finally {
    dns.lookup = lookup;
    global.fetch = fetch;
  }
}

test('a link whose name resolves to a private address is never fetched', async () => {
  await withNetwork({ 'internal.example': '10.0.0.5' }, {}, async (visited) => {
    await assert.rejects(fetchPublic('https://internal.example/admin'), PrivateAddressError);
    assert.deepEqual(visited, []);
  });
});

test('a redirect to a private address is refused at that hop', async () => {
  const hop = new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:5432/' } });
  await withNetwork({}, { 'https://public.example/go': hop }, async (visited) => {
    await assert.rejects(fetchPublic('https://public.example/go'), PrivateAddressError);
    assert.deepEqual(visited, ['https://public.example/go']);
  });
});

test('public pages and public redirects are followed', async () => {
  const hop = new Response(null, { status: 301, headers: { location: '/final' } });
  await withNetwork({}, { 'https://public.example/start': hop }, async (visited) => {
    const res = await fetchPublic('https://public.example/start');
    assert.equal(res.status, 200);
    assert.deepEqual(visited, ['https://public.example/start', 'https://public.example/final']);
  });
});
