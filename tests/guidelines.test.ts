import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatPercent, nhsPlco, uspstf2021 } from '../src/guidelines.ts';
import { explain } from '../src/explain.ts';
import { plcom2012, type Inputs } from '../src/plcom2012.ts';

const person: Inputs = {
  age: 60,
  race: 'white',
  education: 4,
  bmi: 27,
  copd: false,
  personalCancerHistory: false,
  familyLungCancer: false,
  smokingStatus: 'current',
  cigarettesPerDay: 20,
  yearsSmoked: 25,
};

test('USPSTF: eligible at exactly the boundaries', () => {
  assert.ok(uspstf2021({ ...person, age: 50, yearsSmoked: 20 }).eligible); // 20 pack-years
  assert.ok(uspstf2021({ ...person, age: 80 }).eligible);
  assert.ok(uspstf2021({ ...person, smokingStatus: 'former', yearsSinceQuit: 15 }).eligible);
});

test('USPSTF: each criterion can rule someone out on its own', () => {
  assert.ok(!uspstf2021({ ...person, age: 49 }).eligible);
  assert.ok(!uspstf2021({ ...person, age: 81 }).eligible);
  assert.ok(!uspstf2021({ ...person, cigarettesPerDay: 10, yearsSmoked: 39 }).eligible); // 19.5 py
  assert.ok(!uspstf2021({ ...person, smokingStatus: 'former', yearsSinceQuit: 16 }).eligible);
});

test('USPSTF: explains which criteria failed', () => {
  const v = uspstf2021({ ...person, age: 45, cigarettesPerDay: 5 });
  assert.deepEqual(
    v.reasons.map((r) => r.met),
    [false, false, true],
  );
  assert.match(v.reasons[1]?.text ?? '', /you: 6\.3/);
});

test('NHS: 1.51% threshold and age 55-74', () => {
  const heavy: Inputs = { ...person, age: 65, cigarettesPerDay: 30, yearsSmoked: 45 };
  assert.ok(plcom2012(heavy).risk >= 0.0151);
  assert.ok(nhsPlco(heavy).eligible);
  assert.ok(!nhsPlco({ ...heavy, age: 54 }).eligible);
  assert.ok(!nhsPlco({ ...heavy, age: 75 }).eligible);
});

test('the guidelines disagree: high risk but under 20 pack-years', () => {
  // A 70-year-old who smoked 10/day for 35 years (17.5 pack-years), quit 3
  // years ago, has COPD and a family history. USPSTF says no; the risk
  // model says screen. This gap is the published debate the tool shows.
  const p: Inputs = {
    ...person,
    age: 70,
    copd: true,
    familyLungCancer: true,
    smokingStatus: 'former',
    cigarettesPerDay: 10,
    yearsSmoked: 35,
    yearsSinceQuit: 3,
  };
  assert.ok(!uspstf2021(p).eligible);
  assert.ok(nhsPlco(p).eligible);
});

test('the guidelines disagree the other way: 20 pack-years but low modelled risk', () => {
  const p: Inputs = {
    ...person,
    age: 55,
    education: 6,
    bmi: 32,
    smokingStatus: 'former',
    cigarettesPerDay: 40,
    yearsSmoked: 10,
    yearsSinceQuit: 14,
  };
  assert.ok(uspstf2021(p).eligible);
  assert.ok(!nhsPlco(p).eligible);
});

test('formatPercent keeps small risks readable', () => {
  assert.equal(formatPercent(0.00045), '0.04%');
  assert.equal(formatPercent(0.00004), '<0.01%'); // never "0.00%"
  assert.equal(formatPercent(0.0001), '0.01%');
  assert.equal(formatPercent(0.0151), '1.51%');
  assert.equal(formatPercent(0.01505), '1.50%');
  assert.equal(formatPercent(0.015099), '1.50%'); // just under the cut-off must never show 1.51%
  assert.equal(formatPercent(0.0951), '9.51%');
  assert.equal(formatPercent(0.128), '12.8%');
});

test('explain uses natural frequencies and the right band', () => {
  const low = explain(0.004);
  assert.equal(low.band, 'lower');
  assert.match(low.frequency, /about 4 would/);
  assert.match(explain(0.0003).frequency, /, fewer than 1 would/);
  assert.equal(explain(0.0003).people, 0);
  // 0.08% is 0.8 in 1,000: the sentence and the dots must agree on 1
  assert.match(explain(0.0008).frequency, /about 1 would/);
  assert.equal(explain(0.0008).people, 1);
  assert.equal(explain(0.0151).band, 'moderate');
  const high = explain(0.12);
  assert.equal(high.band, 'higher');
  assert.match(high.nextStep, /talk to a doctor/i);
});
