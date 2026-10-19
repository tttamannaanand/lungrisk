import { explain } from '../src/explain.ts';
import {
  formatPercent,
  nhsPlco,
  NHS_PLCO_THRESHOLD,
  uspstf2021,
  type Verdict,
} from '../src/guidelines.ts';
import {
  InputError,
  packYears,
  plcom2012,
  type Education,
  type Inputs,
  type Race,
} from '../src/plcom2012.ts';

const form = document.getElementById('form') as HTMLFormElement;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** The gauge runs 0-10%; anything above pins to the end. */
const GAUGE_MAX = 0.1;
const ARC = $('arc') as unknown as SVGPathElement;
const ARC_LENGTH = ARC.getTotalLength();
ARC.style.strokeDasharray = `${ARC_LENGTH}`;

// Mark the NHS threshold on the arc.
{
  const t = Math.PI * (1 - NHS_PLCO_THRESHOLD / GAUGE_MAX);
  const [cx, cy, r] = [100, 100, 84];
  const tick = $('tick');
  tick.setAttribute('x1', String(cx + (r - 13) * Math.cos(t)));
  tick.setAttribute('y1', String(cy - (r - 13) * Math.sin(t)));
  tick.setAttribute('x2', String(cx + (r + 13) * Math.cos(t)));
  tick.setAttribute('y2', String(cy - (r + 13) * Math.sin(t)));
}

// 1,000 dots, one per person.
const dots = $('dots');
dots.append(...Array.from({ length: 1000 }, () => document.createElement('i')));

function read(): Inputs {
  const f = new FormData(form);
  const num = (k: string) => Number(f.get(k));
  const metres = num('height') / 100;
  const status = f.get('smokingStatus') === 'former' ? 'former' : 'current';
  const inputs: Inputs = {
    age: num('age'),
    race: String(f.get('race')) as Race,
    education: num('education') as Education,
    bmi: Math.round((num('weight') / (metres * metres)) * 10) / 10,
    copd: f.has('copd'),
    personalCancerHistory: f.has('personalCancerHistory'),
    familyLungCancer: f.has('familyLungCancer'),
    smokingStatus: status,
    cigarettesPerDay: num('cigarettesPerDay'),
    yearsSmoked: num('yearsSmoked'),
  };
  if (status === 'former') inputs.yearsSinceQuit = num('yearsSinceQuit');
  return inputs;
}

/** Keep slider labels, fills and limits in step with each other. */
function syncSliders() {
  const age = Number((form.elements.namedItem('age') as HTMLInputElement).value);
  const yrs = form.elements.namedItem('yearsSmoked') as HTMLInputElement;
  const quit = form.elements.namedItem('yearsSinceQuit') as HTMLInputElement;
  // Can't have smoked (or quit) for longer than you've been alive past ~10.
  yrs.max = String(Math.max(1, age - 10));
  if (Number(yrs.value) > Number(yrs.max)) yrs.value = yrs.max;
  quit.max = String(Math.max(0, age - 10 - Number(yrs.value)));
  if (Number(quit.value) > Number(quit.max)) quit.value = quit.max;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const labels: Record<string, (v: number) => string> = {
    age: (v) => `${v}`,
    cigarettesPerDay: (v) => (v >= 60 ? '60+' : `${v}`),
    yearsSmoked: (v) => plural(v, 'year', 'years'),
    yearsSinceQuit: (v) => (v === 0 ? 'this year' : plural(v, 'year', 'years')),
  };
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type=range]')) {
    const v = Number(input.value);
    const pct = ((v - Number(input.min)) / (Number(input.max) - Number(input.min) || 1)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
    const out = input.parentElement?.querySelector('output');
    if (out) out.textContent = labels[input.name]?.(v) ?? String(v);
  }
}

function renderVerdict(el: HTMLElement, v: Verdict) {
  const verdict = el.querySelector('.verdict') as HTMLElement;
  verdict.textContent = v.eligible ? 'Would offer a scan' : 'Would not offer a scan';
  verdict.className = `verdict ${v.eligible ? 'yes' : 'no'}`;
  (el.querySelector('ul') as HTMLElement).replaceChildren(
    ...v.reasons.map((r) =>
      Object.assign(document.createElement('li'), {
        className: r.met ? 'met' : 'unmet',
        textContent: r.text,
      }),
    ),
  );
}

function update() {
  syncSliders();
  const status = new FormData(form).get('smokingStatus');
  $('quitRow').hidden = status !== 'former';

  let inputs: Inputs;
  let result;
  try {
    inputs = read();
    result = plcom2012(inputs);
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    $('error').textContent = e.message;
    $('result').classList.add('stale');
    return;
  }
  $('error').textContent = '';
  $('result').classList.remove('stale');

  $('bmi').textContent = `BMI ${inputs.bmi}`;
  $('packYears').textContent =
    `${Math.round(packYears(inputs.cigarettesPerDay, inputs.yearsSmoked) * 10) / 10} pack-years`;

  const ex = explain(result.risk);
  const extrapolated = result.reliability === 'extrapolated';
  const shown = formatPercent(result.risk);
  $('riskNum').textContent = extrapolated && !shown.startsWith('<') ? `~${shown}` : shown;
  $('band').textContent = {
    lower: 'Below screening level',
    moderate: 'Around screening level',
    higher: 'Above screening level',
  }[ex.band];
  const tag = $('reliability');
  tag.textContent = extrapolated ? 'Rough guide at this age' : 'Within model range';
  tag.className = `tag ${result.reliability}`;

  const fraction = Math.min(result.risk / GAUGE_MAX, 1);
  ARC.style.strokeDashoffset = `${ARC_LENGTH * (1 - fraction)}`;
  ARC.setAttribute('class', `arc ${ex.band}`);

  $('frequency').textContent = ex.frequency;
  const lit = ex.people;
  dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k < lit));

  $('nextStep').textContent = ex.nextStep;
  $('cautions').replaceChildren(
    ...result.cautions.map((c) => Object.assign(document.createElement('li'), { textContent: c })),
  );

  const us = uspstf2021(inputs);
  const nhs = nhsPlco(inputs);
  renderVerdict($('uspstf'), us);
  renderVerdict($('nhs'), nhs);

  const disagree = $('disagree');
  disagree.hidden = us.eligible === nhs.eligible;
  disagree.innerHTML = nhs.eligible
    ? '<strong>These rules disagree about you.</strong> The US rule only looks at age and pack-years, so it misses risk from things like COPD or family history. This is one of the main arguments for risk-based screening.'
    : '<strong>These rules disagree about you.</strong> You meet the US pack-year rule, but the risk model, which also weighs your other factors, puts you below the NHS line.';
}

form.addEventListener('input', update);
update();
