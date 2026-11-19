/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests load TypeScript through the test bootstrap. */
// Discover's date range, closed registrations and team-size sort.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../tests-setup.cjs');
const { DEFAULTS, filtersToQuery, matches, parseFilters, rangeLabel, registrationClosed, sortHackathons } = require('../src/app/discoverFilters.ts');

const base = { id: 'x', source: 'devpost', title: 'X', tagline: null, url: 'https://example.com', image: null, mode: 'online', city: null, state: null, country: null, venue: null, lat: null, lng: null, startsAt: null, endsAt: null, regStartsAt: null, regEndsAt: null, prizeText: null, prizeUsd: null, entryFee: null, themes: [], organizer: null, teamMin: null, teamMax: null };
const h = (over) => ({ ...base, ...over });
const local = (day, time = '12:00:00') => new Date(`${day}T${time}`).toISOString();

test('two dates keep only hackathons that happen inside them', () => {
  const f = { ...DEFAULTS, from: '2030-03-10', to: '2030-03-20' };
  assert.equal(matches(h({ startsAt: local('2030-03-12'), endsAt: local('2030-03-14') }), f), true, 'fully inside');
  assert.equal(matches(h({ startsAt: local('2030-03-10', '00:00:00'), endsAt: local('2030-03-20', '23:00:00') }), f), true, 'first and last day count');
  assert.equal(matches(h({ startsAt: local('2030-03-08'), endsAt: local('2030-03-12') }), f), false, 'starts before');
  assert.equal(matches(h({ startsAt: local('2030-03-18'), endsAt: local('2030-03-22') }), f), false, 'ends after');
  assert.equal(matches(h({}), f), false, 'no dates');
});

test('one date keeps everything from today until then, including ones already running', () => {
  const f = { ...DEFAULTS, to: '2030-03-20' };
  assert.equal(matches(h({ startsAt: local('2030-01-01'), endsAt: local('2030-03-15') }), f), true);
  assert.equal(matches(h({ endsAt: local('2030-03-21') }), f), false);
});

test('the date range round-trips through the URL and rejects bad dates', () => {
  const f = parseFilters(new URLSearchParams(filtersToQuery({ ...DEFAULTS, from: '2030-03-10', to: '2030-03-20' })));
  assert.deepEqual([f.from, f.to], ['2030-03-10', '2030-03-20']);
  assert.deepEqual([parseFilters(new URLSearchParams('from=2030-13-45&to=soon')).from, parseFilters(new URLSearchParams('to=soon')).to], ['', '']);
  assert.equal(rangeLabel('', '2030-03-20'), 'Today – Mar 20');
  assert.equal(rangeLabel('2030-03-10', '2030-03-20'), 'Mar 10 – Mar 20');
});

test('closed registration: a passed close date, or an in-person event that has started without one', () => {
  const now = new Date('2030-03-10T12:00:00Z').getTime();
  assert.equal(registrationClosed(h({ regEndsAt: '2030-03-09T00:00:00Z', startsAt: '2030-04-01T00:00:00Z' }), now), true);
  assert.equal(registrationClosed(h({ regEndsAt: '2030-03-11T00:00:00Z' }), now), false);
  assert.equal(registrationClosed(h({ mode: 'offline', startsAt: '2030-03-09T00:00:00Z', endsAt: '2030-03-11T00:00:00Z' }), now), true);
  assert.equal(registrationClosed(h({ mode: 'online', startsAt: '2030-03-09T00:00:00Z', endsAt: '2030-03-30T00:00:00Z' }), now), false, 'online ones take entries till the deadline');
});

test('team-size sorts put known sizes first, smallest or largest', () => {
  const list = [h({ id: 'big', title: 'Big', teamMin: 3, teamMax: 5 }), h({ id: 'unknown', title: 'Unknown' }), h({ id: 'solo', title: 'Solo', teamMin: 1, teamMax: 1 }), h({ id: 'pair', title: 'Pair', teamMin: 1, teamMax: 2 })];
  assert.deepEqual(sortHackathons([...list], 'teamSmall').map((x) => x.id), ['solo', 'pair', 'big', 'unknown']);
  assert.deepEqual(sortHackathons([...list], 'teamLarge').map((x) => x.id), ['big', 'pair', 'solo', 'unknown']);
});
