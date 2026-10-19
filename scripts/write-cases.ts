// Writes a fixed, varied set of people for the R conformance check.
// Deterministic (seeded), so the committed file only changes on purpose.
import { writeFileSync } from 'node:fs';

import { RACES, plcom2012, type Education, type Inputs } from '../src/plcom2012.ts';

// The R package names races differently.
const R_RACE = {
  white: 'white',
  black: 'black',
  hispanic: 'hispanic',
  asian: 'asian',
  american_indian_alaskan: 'american indian',
  native_hawaiian_pacific: 'native hawaiian',
} as const;

let seed = 2012;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;

const cases = [];
while (cases.length < 500) {
  const age = int(45, 85);
  const yearsSmoked = int(1, age - 15);
  const current = rand() < 0.5;
  const inputs: Inputs = {
    age,
    race: pick(RACES),
    education: int(1, 6) as Education,
    bmi: Math.round((16 + rand() * 30) * 10) / 10,
    copd: rand() < 0.3,
    personalCancerHistory: rand() < 0.1,
    familyLungCancer: rand() < 0.2,
    smokingStatus: current ? 'current' : 'former',
    cigarettesPerDay: int(1, 60),
    yearsSmoked,
    ...(current
      ? {}
      : { yearsSinceQuit: int(0, age - yearsSmoked - 15 > 0 ? age - yearsSmoked - 15 : 0) }),
  };
  cases.push({ inputs, rRace: R_RACE[inputs.race], risk: plcom2012(inputs).risk });
}

writeFileSync('tests/fixtures/conformance-cases.json', JSON.stringify(cases, null, 1) + '\n');
console.log(`wrote ${cases.length} cases`);
