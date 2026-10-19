# Lung Risk Check

[![CI](https://github.com/tttamannaanand/lungrisk/actions/workflows/ci.yml/badge.svg)](https://github.com/tttamannaanand/lungrisk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-000)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-000?logo=typescript&logoColor=white)
![Runs in browser](https://img.shields.io/badge/data-never%20leaves%20your%20device-000)

**[→ Try it](https://tttamannaanand.github.io/lungrisk/)**

Estimates a smoker's or ex-smoker's chance of being diagnosed with lung cancer in the next 6 years, using **PLCOm2012**, the model NHS England uses to decide who to screen. It then shows whether two different screening rules would offer that person a low-dose CT scan, and explains **why they disagree**.

> ⚠️ An educational estimate, not a diagnosis or medical advice. The model was built from US participants aged 55–74. The calculator accepts ages 18–90, but outside 55–74 it labels the result a rough guide.

## Why this exists

Screening with low-dose CT catches lung cancer early, but who gets offered a scan depends on the rule:

| | **US: USPSTF 2021** | **NHS England** |
|---|---|---|
| Who qualifies | Age 50–80, **≥ 20 pack-years**, smoke now or quit ≤ 15 years ago | Age 55–74, **PLCOm2012 risk ≥ 1.51%** |
| What it looks at | Age and smoking only | Age, smoking, COPD, family history, prior cancer, BMI, education, ethnicity |

The two rules regularly disagree, and the calculator shows it live. A 70-year-old who smoked 10 a day for 35 years and quit 3 years ago, with COPD and a family history of lung cancer, has a modelled risk **above the NHS 1.51% threshold** (about 1.8–2.7%, depending on BMI, education and ethnicity). The US rule turns them away for having 17.5 pack-years instead of 20. That gap is a real, published argument for risk-based screening.

## How the numbers are checked

A medical calculator is only useful if its numbers are exactly right, so the model is verified three independent ways:

1. **Two published implementations agree.** Every coefficient was cross-checked against the Merck Manual's calculator and the [resplab/PLCOm2012](https://github.com/resplab/PLCOm2012) R package before any code was written.
2. **Hand-worked reference values.** Five people with different risk profiles were computed term by term in Python, a separate language, and the TypeScript must match to 10⁻¹¹ (`tests/plcom2012.test.ts`).
3. **Conformance against the R package in CI.** Every push runs the research group's own R function on **500 varied people** and fails if any result differs by more than 10⁻¹² (`scripts/r-reference.R`, `scripts/compare-with-r.ts`). The R code is pinned to an exact commit, so the reference can't drift.

Other tests check behaviour, not just numbers:
- Risk moves in the published direction for every factor.
- Invalid inputs are rejected with a clear message: never-smokers, impossible smoking histories, out-of-range values.
- Both kinds of guideline disagreement are pinned down.
- Displayed percentages **truncate instead of rounding** below 10%, so a risk of 1.5096% can never be shown as "1.51%" next to a "≥ 1.51%" threshold it doesn't meet.

## Honest limitations

The page shows these where they apply, rather than hiding them:
- **Age:** the model was built on ages 55–74. Ages 18–90 are accepted, but outside that range the result is marked as a rough guide. Under 50 there's an explicit warning that a low 6-year number doesn't mean smoking is safe, and risks below 0.01% show as "<0.01%", never "0.00%".
- **South Asian users:** the "Asian" adjustment comes from US participants and **has not been validated for South Asian populations**.
- **Other tobacco:** bidis are counted as cigarettes, but chewed tobacco and hookah aren't in the model at all.
- **NHS route:** NHS England also accepts the LLPv2 model (≥ 2.5%), which this tool doesn't calculate.

## Privacy

There's no server. The whole calculator is about 10 KB of static files, and everything you enter stays in your browser.

## Run it

```bash
npm install
npm test              # 23 tests
npm run dev           # local site
npm run build         # static site in dist/
```

## Sources

- Tammemägi MC et al. *Selection criteria for lung-cancer screening.* N Engl J Med 2013;368:728-36. doi:10.1056/NEJMoa1211776
- [USPSTF 2021: Lung Cancer Screening](https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/lung-cancer-screening)
- NHS England Targeted Lung Health Check: PLCOm2012 ≥ 1.51% (as described in Lebrett et al., *Thorax* 2020)
- India's [National Tobacco Quitline](https://ntcp.mohfw.gov.in/national_tobacco_quit_line_services): 1800 112 356

## License

[MIT](LICENSE). Not a medical device.
