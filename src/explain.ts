import { formatPercent } from './guidelines.ts';

export interface Explanation {
  headline: string;
  /** "About N in 1,000 people like you..." Natural frequencies are easier to read than percentages. */
  frequency: string;
  band: 'lower' | 'moderate' | 'higher';
  nextStep: string;
}

/**
 * Plain-language summary. Bands are relative to the NHS 1.51% cut-off and
 * describe *screening relevance*, not whether someone is "safe".
 */
export function explain(risk: number): Explanation {
  const perThousand = risk * 1000;
  const n = perThousand < 1 ? 'fewer than 1' : String(Math.round(perThousand)).replace(/^0$/, '1');

  const band = risk < 0.0151 ? 'lower' : risk < 0.05 ? 'moderate' : 'higher';
  const nextStep = {
    lower:
      'Your estimated risk is below the level where screening programmes usually offer a scan. Stopping smoking is still the single biggest way to lower it further.',
    moderate:
      'Your estimated risk is at a level where some screening programmes offer a low-dose CT scan. Talk to a doctor about whether screening is right for you.',
    higher:
      'Your estimated risk is high enough that screening is usually recommended. Please talk to a doctor about a low-dose CT scan, and about support to stop smoking.',
  }[band];

  return {
    headline: `${formatPercent(risk)} chance of a lung cancer diagnosis in the next 6 years`,
    frequency: `Out of 1,000 people with answers like yours, about ${n} would be diagnosed with lung cancer within 6 years.`,
    band,
    nextStep,
  };
}
