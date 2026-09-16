import Decimal from 'decimal.js';
import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { adultAgeYears, positive, precision, sex } from '../core/schemas';
import { ckdStage } from '../domain/renal';

export const EGFR_METHODS = ['CKD_EPI_2021', 'CKD_EPI_2009', 'MDRD_175'] as const;
export type EgfrMethod = (typeof EGFR_METHODS)[number];

/** CKD-EPI 공통형: A × min(Scr/κ,1)^α × max(Scr/κ,1)^β × γ^Age × (F factor) */
function ckdEpi(
  scr: number,
  age: number,
  female: boolean,
  c: { A: number; alphaF: number; alphaM: number; beta: number; gamma: number; femaleFactor: number },
): Decimal {
  const kappa = female ? 0.7 : 0.9;
  const alpha = female ? c.alphaF : c.alphaM;
  const ratio = D(scr).div(kappa);
  return D(c.A)
    .times(Decimal.min(ratio, 1).pow(alpha))
    .times(Decimal.max(ratio, 1).pow(c.beta))
    .times(D(c.gamma).pow(age))
    .times(female ? c.femaleFactor : 1);
}

export function estimateGfr(method: EgfrMethod, scr: number, age: number, sexCode: 'M' | 'F'): Decimal {
  const female = sexCode === 'F';
  switch (method) {
    case 'CKD_EPI_2021':
      return ckdEpi(scr, age, female, { A: 142, alphaF: -0.241, alphaM: -0.302, beta: -1.2, gamma: 0.9938, femaleFactor: 1.012 });
    case 'CKD_EPI_2009':
      // 인종 계수(×1.159)는 레거시와 동일하게 적용하지 않음
      return ckdEpi(scr, age, female, { A: 141, alphaF: -0.329, alphaM: -0.411, beta: -1.209, gamma: 0.993, femaleFactor: 1.018 });
    case 'MDRD_175':
      return D(175)
        .times(D(scr).pow(-1.154))
        .times(D(age).pow(-0.203))
        .times(female ? 0.742 : 1);
  }
}

export default defineCalculator({
  code: 'EGFR',
  name: 'Estimated GFR',
  category: 'renal',
  summary:
    '혈청 크레아티닌 기반 추정 사구체여과율. 기본 CKD-EPI 2021(인종 미포함), 옵션으로 CKD-EPI 2009·MDRD(IDMS, 175) 선택. 성인(≥18세) 전용',
  formula: [
    'CKD-EPI 2021: eGFR = 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^−1.200 × 0.9938^Age × 1.012 [female]   (κ: F 0.7 / M 0.9, α: F −0.241 / M −0.302)',
    'CKD-EPI 2009: eGFR = 141 × min(Scr/κ,1)^α × max(Scr/κ,1)^−1.209 × 0.993^Age × 1.018 [female]   (α: F −0.329 / M −0.411)',
    'MDRD (IDMS) : eGFR = 175 × Scr^−1.154 × Age^−0.203 × 0.742 [female]',
    'Unit: mL/min/1.73m²',
  ].join('\n'),
  references: [
    {
      title: 'Inker LA, et al. New Creatinine- and Cystatin C–Based Equations to Estimate GFR without Race. N Engl J Med 2021;385:1737-49',
      url: 'https://doi.org/10.1056/NEJMoa2102953',
    },
    {
      title: 'Levey AS, et al. A New Equation to Estimate Glomerular Filtration Rate (CKD-EPI). Ann Intern Med 2009;150(9):604-12',
      url: 'https://doi.org/10.7326/0003-4819-150-9-200905050-00006',
    },
    {
      title: 'Levey AS, et al. Expressing the MDRD Study equation for estimating GFR with standardized serum creatinine values. Clin Chem 2007;53(4):766-72',
      url: 'https://doi.org/10.1373/clinchem.2006.077180',
    },
    { title: 'KDIGO 2024 CKD Guideline — GFR categories G1–G5', url: 'https://kdigo.org/guidelines/ckd-evaluation-and-management/' },
    { title: '대한신장학회 eGFR 계산기 (레거시 검증 링크)', url: 'https://ksn.or.kr/general/about/check.php' },
  ],
  limitations: [
    '만 18세 미만 소아·청소년 환자에게는 적용할 수 없습니다 (소아는 Bedside Schwartz 공식 권장).',
    '신기능이 급변하는 급성 신손상(AKI) 환자에게는 크레아티닌이 정상상태(steady-state)가 아니므로 적용할 수 없습니다.',
    '근육량이 극단적인 환자(사지 절단, 신경근육 질환, 심한 근감소증, 보디빌더)는 크레아티닌 생성이 비정상적이므로 왜곡될 수 있습니다.',
    '임산부 및 신대체요법(투석) 중인 환자에게는 적용할 수 없습니다.',
  ],
  legacySource:
    'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "EGFR","EGFR2" (CALC_TYPE 3→2021, 2→2009, Else→MDRD)',
  input: z.object({
    serumCreatinine: positive('혈청 크레아티닌 (IDMS 표준화)', 'mg/dL', 1.0),
    age: adultAgeYears.clone().meta({ example: 50 }),
    sex,
    method: z.enum(EGFR_METHODS).default('CKD_EPI_2021').describe('추정식'),
    precision: precision(1),
  }),
  output: z.object({
    egfr: z.number().describe('eGFR [mL/min/1.73m²]'),
    unit: z.literal('mL/min/1.73m2'),
    method: z.enum(EGFR_METHODS),
    ckdStage: z.enum(['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5']).describe('KDIGO GFR 카테고리'),
  }),
  example: { serumCreatinine: 1.0, age: 50, sex: 'M' },
  compute: ({ serumCreatinine, age, sex, method, precision }) => {
    const egfr = fix(estimateGfr(method, serumCreatinine, age, sex), precision);
    return { egfr, unit: 'mL/min/1.73m2' as const, method, ckdStage: ckdStage(egfr) };
  },
});
