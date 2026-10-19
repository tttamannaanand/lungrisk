import { packYears, plcom2012, type Inputs } from './plcom2012.ts';

export interface Verdict {
  eligible: boolean;
  /** One line per criterion, met or not, in plain language. */
  reasons: { met: boolean; text: string }[];
}

/**
 * USPSTF 2021 (Grade B): adults aged 50-80 with a 20 pack-year history who
 * currently smoke or quit within the past 15 years.
 * https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/lung-cancer-screening
 */
export function uspstf2021(i: Inputs): Verdict {
  const py = packYears(i.cigarettesPerDay, i.yearsSmoked);
  const quit = i.smokingStatus === 'current' ? 0 : (i.yearsSinceQuit ?? Infinity);
  const reasons = [
    { met: i.age >= 50 && i.age <= 80, text: `Age 50 to 80 (you: ${i.age})` },
    { met: py >= 20, text: `At least 20 pack-years (you: ${round1(py)})` },
    {
      met: quit <= 15,
      text:
        i.smokingStatus === 'current'
          ? 'Currently smoke, or quit within 15 years (you: currently smoke)'
          : `Currently smoke, or quit within 15 years (you: quit ${quit} years ago)`,
    },
  ];
  return { eligible: reasons.every((r) => r.met), reasons };
}

/** Risk cut-off used by NHS England's Targeted Lung Health Check programme. */
export const NHS_PLCO_THRESHOLD = 0.0151;

/**
 * NHS England targeted screening, PLCOm2012 route: ever-smokers aged 55-74
 * with a 6-year risk of at least 1.51%. (The programme also accepts an
 * LLPv2 score of at least 2.5%, which this tool does not calculate.)
 */
export function nhsPlco(i: Inputs): Verdict {
  const { risk } = plcom2012(i);
  const reasons = [
    { met: i.age >= 55 && i.age <= 74, text: `Age 55 to 74 (you: ${i.age})` },
    {
      met: risk >= NHS_PLCO_THRESHOLD,
      text: `6-year risk of at least 1.51% (you: ${formatPercent(risk)})`,
    },
  ];
  return { eligible: reasons.every((r) => r.met), reasons };
}

export function formatPercent(p: number): string {
  // Below 10%, truncate to two decimals instead of rounding, so a risk just
  // under the 1.51% cut-off can never display as 1.51% (1.5096% -> "1.50%").
  const pct = p * 100;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  return `${(Math.floor(pct * 100 + 1e-9) / 100).toFixed(2)}%`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
