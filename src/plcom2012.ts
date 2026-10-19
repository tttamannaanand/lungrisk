/**
 * PLCOm2012: 6-year lung cancer risk for people who have ever smoked.
 *
 * Tammemägi MC et al. Selection criteria for lung-cancer screening.
 * N Engl J Med 2013;368:728-36. doi:10.1056/NEJMoa1211776
 *
 * Coefficients cross-checked against two independent implementations:
 * the Merck Manual / EBMcalc calculator and the resplab/PLCOm2012 R package.
 * CI also runs the R package against this code (see scripts/).
 */

export const RACES = [
  'white',
  'black',
  'hispanic',
  'asian',
  'american_indian_alaskan',
  'native_hawaiian_pacific',
] as const;
export type Race = (typeof RACES)[number];

/** Six ordinal levels, as coded in the PLCO trial. */
export const EDUCATION_LEVELS = {
  1: 'Less than high school',
  2: 'High school graduate',
  3: 'Post-high-school training',
  4: 'Some college',
  5: 'College graduate',
  6: 'Postgraduate or professional degree',
} as const;
export type Education = keyof typeof EDUCATION_LEVELS;

export interface Inputs {
  age: number;
  race: Race;
  education: Education;
  bmi: number;
  /** Ever diagnosed with COPD, emphysema or chronic bronchitis. */
  copd: boolean;
  /** Personal history of cancer. */
  personalCancerHistory: boolean;
  /** Parent or sibling with lung cancer. */
  familyLungCancer: boolean;
  smokingStatus: 'current' | 'former';
  /** Average cigarettes per day while smoking. */
  cigarettesPerDay: number;
  /** Total years smoked. */
  yearsSmoked: number;
  /** Years since quitting (ignored for current smokers, who count as 0). */
  yearsSinceQuit?: number;
}

export const COEF = {
  intercept: -4.532506,
  age: 0.0778868, // per year, centred at 62
  education: -0.0812744, // per level, centred at 4
  bmi: -0.0274194, // per kg/m², centred at 27
  copd: 0.3553063,
  personalCancerHistory: 0.4589971,
  familyLungCancer: 0.587185,
  currentSmoker: 0.2597431,
  // Intensity enters as (cigarettes per day / 10)^-1, centred at 0.4021541613
  intensity: -1.822606,
  intensityCentre: 0.4021541613,
  duration: 0.0317321, // per year smoked, centred at 27
  quitTime: -0.0308572, // per year since quitting, centred at 10
  race: {
    white: 0,
    american_indian_alaskan: 0,
    black: 0.3944778,
    hispanic: -0.7434744,
    asian: -0.466585,
    native_hawaiian_pacific: 1.027152,
  } satisfies Record<Race, number>,
} as const;

/** The age range of the PLCO trial participants the model was built from. */
export const DEVELOPED_AGE_RANGE = [55, 74] as const;

/** Below this age, a low 6-year risk is especially easy to misread. */
export const YOUNG_AGE = 50;

export class InputError extends Error {}

export interface Result {
  /** Probability of a lung cancer diagnosis within 6 years, 0-1. */
  risk: number;
  logit: number;
  /** Reasons to treat this estimate with extra caution. */
  cautions: string[];
  /**
   * 'validated' inside the 55-74 age range the model was built on;
   * 'extrapolated' outside it, where the number is a rough guide at best.
   */
  reliability: 'validated' | 'extrapolated';
}

export function validate(i: Inputs): void {
  const check = (ok: boolean, msg: string) => {
    if (!ok) throw new InputError(msg);
  };
  const finite = (n: number) => Number.isFinite(n);
  check(finite(i.age) && i.age >= 18 && i.age <= 90, 'Age must be between 18 and 90.');
  check(RACES.includes(i.race), 'Unknown race or ethnicity.');
  check(i.education in EDUCATION_LEVELS, 'Education must be a level from 1 to 6.');
  check(finite(i.bmi) && i.bmi >= 12 && i.bmi <= 70, 'BMI must be between 12 and 70.');
  check(
    finite(i.cigarettesPerDay) && i.cigarettesPerDay > 0 && i.cigarettesPerDay <= 200,
    'Cigarettes per day must be more than 0. This model only applies to people who have smoked.',
  );
  check(
    finite(i.yearsSmoked) && i.yearsSmoked > 0 && i.yearsSmoked <= i.age,
    'Years smoked must be more than 0 and no more than your age.',
  );
  if (i.smokingStatus === 'former') {
    const q = i.yearsSinceQuit;
    check(
      q !== undefined && finite(q) && q >= 0,
      'Years since quitting is required for former smokers.',
    );
    check(
      (q as number) + i.yearsSmoked <= i.age,
      'Years smoked plus years since quitting cannot be more than your age.',
    );
  }
}

export function plcom2012(i: Inputs): Result {
  validate(i);
  const current = i.smokingStatus === 'current';
  const yearsSinceQuit = current ? 0 : (i.yearsSinceQuit as number);

  const logit =
    COEF.intercept +
    COEF.age * (i.age - 62) +
    COEF.race[i.race] +
    COEF.education * (i.education - 4) +
    COEF.bmi * (i.bmi - 27) +
    COEF.copd * Number(i.copd) +
    COEF.personalCancerHistory * Number(i.personalCancerHistory) +
    COEF.familyLungCancer * Number(i.familyLungCancer) +
    COEF.currentSmoker * Number(current) +
    COEF.intensity * (10 / i.cigarettesPerDay - COEF.intensityCentre) +
    COEF.duration * (i.yearsSmoked - 27) +
    COEF.quitTime * (yearsSinceQuit - 10);

  const cautions: string[] = [];
  const [lo, hi] = DEVELOPED_AGE_RANGE;
  const reliability = i.age < lo || i.age > hi ? 'extrapolated' : 'validated';
  if (i.age < YOUNG_AGE) {
    cautions.push(
      `The model was built from people aged ${lo}-${hi}. At ${i.age} it can only see the next 6 years, when lung cancer is still rare. A low number here does not mean smoking is safe: the damage builds up over decades, and quitting now prevents most of it.`,
    );
  } else if (reliability === 'extrapolated') {
    cautions.push(
      `The model was built from people aged ${lo}-${hi}, so it is less reliable at age ${i.age}.`,
    );
  }
  if (i.race === 'asian') {
    cautions.push(
      'The Asian adjustment comes from US participants. It has not been validated for South Asian populations, and risk from bidis, hookah or chewed tobacco is not included.',
    );
  }

  return { risk: 1 / (1 + Math.exp(-logit)), logit, cautions, reliability };
}

/** Pack-years: packs of 20 per day × years smoked. */
export function packYears(cigarettesPerDay: number, yearsSmoked: number): number {
  return (cigarettesPerDay / 20) * yearsSmoked;
}
