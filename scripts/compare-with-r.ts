// Fails if this implementation and the R reference disagree on any case.
import { readFileSync } from 'node:fs';

import { plcom2012, type Inputs } from '../src/plcom2012.ts';

const cases: { inputs: Inputs }[] = JSON.parse(
  readFileSync('tests/fixtures/conformance-cases.json', 'utf8'),
);
const rRisks: number[] = JSON.parse(readFileSync('conformance-out/r.json', 'utf8'));
if (rRisks.length !== cases.length) {
  throw new Error(`R returned ${rRisks.length} results for ${cases.length} cases`);
}

let worst = 0;
cases.forEach(({ inputs }, k) => {
  const ours = plcom2012(inputs).risk;
  const diff = Math.abs(ours - (rRisks[k] as number));
  worst = Math.max(worst, diff);
  if (diff > 1e-12) {
    throw new Error(`case ${k}: ours ${ours} vs R ${rRisks[k]}\n${JSON.stringify(inputs)}`);
  }
});
console.log(
  `all ${cases.length} cases match the R reference (max difference ${worst.toExponential(2)})`,
);
