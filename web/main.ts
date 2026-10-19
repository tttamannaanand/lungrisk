import { explain } from '../src/explain.ts';
import { nhsPlco, uspstf2021, type Verdict } from '../src/guidelines.ts';
import { InputError, plcom2012, type Education, type Inputs, type Race } from '../src/plcom2012.ts';

const form = document.getElementById('form') as HTMLFormElement;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

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

function renderVerdict(el: HTMLElement, v: Verdict) {
  const verdict = el.querySelector('.verdict') as HTMLElement;
  verdict.textContent = v.eligible ? 'Would offer screening' : 'Would not offer screening';
  verdict.className = `verdict ${v.eligible ? 'yes' : 'no'}`;
  const list = el.querySelector('ul') as HTMLElement;
  list.replaceChildren(
    ...v.reasons.map((r) => {
      const li = document.createElement('li');
      li.className = r.met ? 'met' : 'unmet';
      li.textContent = `${r.met ? '✓' : '✗'} ${r.text}`;
      return li;
    }),
  );
}

function update() {
  $('quitRow').hidden = new FormData(form).get('smokingStatus') !== 'former';
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

  const ex = explain(result.risk);
  $('headline').textContent = ex.headline;
  $('frequency').textContent = ex.frequency;
  $('nextStep').textContent = ex.nextStep;
  $('fill').style.width = `${Math.min(result.risk / 0.2, 1) * 100}%`;
  $('fill').className = ex.band;
  $('cautions').replaceChildren(
    ...result.cautions.map((c) => Object.assign(document.createElement('li'), { textContent: c })),
  );

  const us = uspstf2021(inputs);
  const nhs = nhsPlco(inputs);
  renderVerdict($('uspstf'), us);
  renderVerdict($('nhs'), nhs);

  const disagree = $('disagree');
  disagree.hidden = us.eligible === nhs.eligible;
  disagree.textContent = nhs.eligible
    ? 'These rules disagree about you. The US rule only counts age and pack-years, so it misses risk from things like COPD or family history. This is one of the main arguments for risk-based screening.'
    : 'These rules disagree about you. You meet the US pack-year rule, but the risk model, which also weighs your other factors, puts you below the NHS threshold.';
}

form.addEventListener('input', update);
update();
