import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InputError, packYears, plcom2012, type Inputs } from '../src/plcom2012.ts';

// The model's own reference person: every centred term is zero except
// intensity (80 cigarettes/day, the R package's documented example).
const reference: Inputs = {
  age: 62,
  race: 'white',
  education: 4,
  bmi: 27,
  copd: false,
  personalCancerHistory: false,
  familyLungCancer: false,
  smokingStatus: 'former',
  cigarettesPerDay: 80,
  yearsSmoked: 27,
  yearsSinceQuit: 10,
};

const close = (actual: number, expected: number, tol = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < tol, `expected ${expected}, got ${actual}`);

// Independent reference values, computed term by term in Python from the
// published coefficients (see README "How the numbers are checked").
const GOLDEN: [string, Inputs, number, number][] = [
  ['reference former smoker', reference, -4.0273631627, 0.017509223397],
  [
    'current heavy smoker with COPD and family history',
    {
      ...reference,
      age: 68,
      education: 2,
      bmi: 24,
      copd: true,
      familyLungCancer: true,
      smokingStatus: 'current',
      cigarettesPerDay: 20,
      yearsSmoked: 45,
      yearsSinceQuit: undefined as never,
    },
    -1.9167284127,
    0.128226835173,
  ],
  [
    'light smoker who quit long ago',
    {
      ...reference,
      age: 60,
      education: 6,
      bmi: 30,
      cigarettesPerDay: 5,
      yearsSmoked: 15,
      yearsSinceQuit: 20,
    },
    -8.5346872127,
    0.000196493005,
  ],
  [
    'Asian current smoker',
    {
      ...reference,
      age: 58,
      race: 'asian',
      education: 5,
      bmi: 23,
      smokingStatus: 'current',
      cigarettesPerDay: 15,
      yearsSmoked: 35,
    },
    -4.9421651794,
    0.00708851833,
  ],
  [
    'Black former smoker with COPD and prior cancer',
    {
      ...reference,
      age: 70,
      race: 'black',
      education: 3,
      bmi: 26,
      copd: true,
      personalCancerHistory: true,
      cigarettesPerDay: 30,
      yearsSmoked: 40,
      yearsSinceQuit: 5,
    },
    -1.899700046,
    0.130142426999,
  ],
];

for (const [name, inputs, logit, risk] of GOLDEN) {
  test(`matches independent reference: ${name}`, () => {
    const r = plcom2012(inputs);
    close(r.logit, logit, 1e-9);
    close(r.risk, risk, 1e-11);
  });
}

test('current smokers count as 0 years since quitting, whatever was entered', () => {
  const current: Inputs = { ...reference, smokingStatus: 'current', yearsSinceQuit: 30 };
  const withoutQuit: Inputs = { ...current };
  delete withoutQuit.yearsSinceQuit;
  assert.equal(plcom2012(current).risk, plcom2012(withoutQuit).risk);
});

test('risk moves in the published direction for every factor', () => {
  const base = plcom2012(reference).risk;
  const higher = (patch: Partial<Inputs>) => plcom2012({ ...reference, ...patch }).risk > base;
  assert.ok(higher({ age: 70 }), 'older');
  assert.ok(higher({ copd: true }), 'COPD');
  assert.ok(higher({ personalCancerHistory: true }), 'prior cancer');
  assert.ok(higher({ familyLungCancer: true }), 'family history');
  assert.ok(higher({ yearsSmoked: 40 }), 'longer smoking');
  assert.ok(higher({ yearsSinceQuit: 2 }), 'quit more recently');
  assert.ok(higher({ smokingStatus: 'current' }), 'still smoking');
  assert.ok(higher({ education: 1 }), 'less education');
  assert.ok(higher({ bmi: 20 }), 'lower BMI');
});

test('more cigarettes per day always means more risk', () => {
  let prev = 0;
  for (const cpd of [1, 5, 10, 20, 40, 80, 120]) {
    const r = plcom2012({ ...reference, cigarettesPerDay: cpd }).risk;
    assert.ok(r > prev, `${cpd}/day should exceed the lower intensity`);
    prev = r;
  }
});

test('risk is always a probability', () => {
  for (const age of [18, 40, 55, 74, 90]) {
    for (const cpd of [1, 200]) {
      const r = plcom2012({
        ...reference,
        age,
        smokingStatus: 'current',
        cigarettesPerDay: cpd,
        yearsSmoked: Math.min(30, age - 12),
      }).risk;
      assert.ok(r > 0 && r < 1);
    }
  }
});

test('rejects people the model does not apply to', () => {
  const bad: [Partial<Inputs>, RegExp][] = [
    [{ cigarettesPerDay: 0 }, /only applies to people who have smoked/],
    [{ age: 17 }, /between 18 and 90/],
    [{ age: 91 }, /between 18 and 90/],
    [{ bmi: 5 }, /BMI/],
    [{ yearsSmoked: 70 }, /no more than your age/],
    [{ yearsSinceQuit: undefined as never }, /required for former smokers/],
    [{ yearsSmoked: 40, yearsSinceQuit: 30 }, /cannot be more than your age/],
    [{ education: 9 as never }, /level from 1 to 6/],
    [{ race: 'martian' as never }, /Unknown race/],
    [{ age: Number.NaN }, /Age/],
  ];
  for (const [patch, msg] of bad) {
    assert.throws(
      () => plcom2012({ ...reference, ...patch }),
      (e: unknown) => {
        assert.ok(e instanceof InputError);
        assert.match(e.message, msg);
        return true;
      },
    );
  }
});

test('cautions outside the age range the model was built on', () => {
  assert.deepEqual(plcom2012(reference).cautions, []);
  assert.equal(plcom2012(reference).reliability, 'validated');
  const older = plcom2012({ ...reference, age: 80 });
  assert.equal(older.reliability, 'extrapolated');
  assert.match(older.cautions[0] ?? '', /aged 55-74, so it is less reliable at age 80/);
});

test('cautions that the Asian adjustment is not validated for South Asians', () => {
  const r = plcom2012({ ...reference, race: 'asian' });
  assert.ok(r.cautions.some((c) => /South Asian/.test(c) && /bidis/.test(c)));
});

test('pack-years', () => {
  assert.equal(packYears(20, 20), 20);
  assert.equal(packYears(10, 30), 15);
  assert.equal(packYears(40, 5), 10);
});

test('young smokers are warned that a low number does not mean safe', () => {
  const young = plcom2012({
    ...reference,
    age: 25,
    smokingStatus: 'current',
    cigarettesPerDay: 20,
    yearsSmoked: 8,
  });
  assert.equal(young.reliability, 'extrapolated');
  assert.ok(young.risk < 0.001, 'the model gives a tiny number at 25...');
  assert.match(young.cautions[0] ?? '', /does not mean smoking is safe/); // ...so say so
});

test('ages 18 to 90 are accepted', () => {
  for (const age of [18, 90]) {
    assert.doesNotThrow(() => plcom2012({ ...reference, age, yearsSmoked: 2, yearsSinceQuit: 1 }));
  }
});
