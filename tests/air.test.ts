import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aqiBand,
  cigarettesPerDay,
  CITIES,
  describeCigarettes,
  fetchCities,
  mean,
  requestUrl,
  summarise,
} from '../src/air.ts';

test('22 µg/m³ for a day is one cigarette', () => {
  assert.equal(cigarettesPerDay(22), 1);
  assert.equal(cigarettesPerDay(0), 0);
  assert.equal(cigarettesPerDay(110), 5);
});

test("reproduces Berkeley Earth's own examples", () => {
  // China average 52 µg/m³ -> 2.4/day; Delhi 547 µg/m³ -> ~25/day
  assert.equal(Math.round(cigarettesPerDay(52) * 10) / 10, 2.4);
  assert.equal(Math.round(cigarettesPerDay(547)), 25);
});

test('rejects impossible readings', () => {
  assert.throws(() => cigarettesPerDay(-1), RangeError);
  assert.throws(() => cigarettesPerDay(Number.NaN), RangeError);
});

test('describes amounts in plain words', () => {
  assert.equal(describeCigarettes(0.1), 'less than a quarter of a cigarette');
  assert.equal(describeCigarettes(0.5), 'about half a cigarette');
  assert.equal(describeCigarettes(1.2), 'about 1 cigarette');
  assert.equal(describeCigarettes(4.6), 'about 5 cigarettes');
});

test('CPCB AQI bands for PM2.5, boundaries inclusive', () => {
  assert.equal(aqiBand(0), 'Good');
  assert.equal(aqiBand(30), 'Good');
  assert.equal(aqiBand(30.1), 'Satisfactory');
  assert.equal(aqiBand(90), 'Moderate');
  assert.equal(aqiBand(121), 'Very poor');
  assert.equal(aqiBand(400), 'Severe');
});

test('mean ignores missing hours, and is null when all are missing', () => {
  assert.equal(mean([10, null, 20]), 15);
  assert.equal(mean([null, null]), null);
  assert.equal(mean([]), null);
});

function series(past: number, next: number, later: number) {
  const time = Array.from({ length: 72 }, (_, k) => `t${k}`);
  const pm25 = [...Array(24).fill(past), ...Array(24).fill(next), ...Array(24).fill(later)];
  return { time, pm25 };
}

test('summarise splits 24 h back from 48 h ahead', () => {
  const s = summarise(series(44, 22, 66));
  assert.equal(s.last24h, 44);
  assert.deepEqual(s.forecast, [22, 66]);
  assert.equal(s.next48.pm25.length, 48);
  assert.equal(s.next48.time[0], 't24');
});

test('summarise finds the worst forecast hour', () => {
  const h = series(10, 10, 10);
  h.pm25[30] = 200; // a forecast spike
  h.pm25[5] = 999; // in the past: must not count as a forecast peak
  assert.deepEqual(summarise(h).peak, { time: 't30', pm25: 200 });
});

test('one request covers every city, 24 h back and 48 h ahead in IST', () => {
  const url = new URL(requestUrl(CITIES));
  assert.equal(url.searchParams.get('latitude')?.split(',').length, CITIES.length);
  assert.equal(url.searchParams.get('past_hours'), '24');
  assert.equal(url.searchParams.get('forecast_hours'), '48');
  assert.equal(url.searchParams.get('timezone'), 'Asia/Kolkata');
});

const fakeFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test('fetchCities maps each location back to its city', async () => {
  const two = CITIES.slice(0, 2);
  const loc = (v: number) => {
    const s = series(v, v, v);
    return { hourly: { time: s.time, pm2_5: s.pm25 } };
  };
  const out = await fetchCities(two, fakeFetch([loc(110), loc(22)]));
  assert.equal(out[0]?.city.name, 'Delhi');
  assert.equal(out[0]?.air.last24h, 110);
  assert.equal(out[1]?.air.last24h, 22);
});

test('fetchCities handles a single location (object, not array)', async () => {
  const one = CITIES.slice(0, 1);
  const s = series(30, 30, 30);
  const out = await fetchCities(one, fakeFetch({ hourly: { time: s.time, pm2_5: s.pm25 } }));
  assert.equal(out[0]?.air.last24h, 30);
});

test('fetchCities fails loudly on errors and mismatched responses', async () => {
  await assert.rejects(fetchCities(CITIES.slice(0, 1), fakeFetch({}, 503)), /503/);
  await assert.rejects(fetchCities(CITIES.slice(0, 2), fakeFetch([])), /Expected 2 locations/);
});
