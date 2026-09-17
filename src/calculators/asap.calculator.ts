import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { adultAgeYears, positive, precision, sex } from '../core/schemas';

/** ASAP 모델 회귀계수 (Yang T, et al. 2019) */
export const ASAP_COEF = {
  intercept: -7.5771177,
  age: 0.04666357,
  female: -0.57611693,
  lnAfp: 0.42243533,
  lnPivka: 1.1051891,
} as const;

export function asapLogit(age: number, female: boolean, afp: number, pivkaII: number): number {
  return (
    ASAP_COEF.intercept +
    ASAP_COEF.age * age +
    ASAP_COEF.female * (female ? 1 : 0) +
    ASAP_COEF.lnAfp * Math.log(afp) +
    ASAP_COEF.lnPivka * Math.log(pivkaII)
  );
}

export default defineCalculator({
  code: 'ASAP',
  name: 'ASAP Score (HCC risk: Age, Sex, AFP, PIVKA-II)',
  category: 'risk-score',
  summary: '나이·성별·AFP·PIVKA-II 로지스틱 회귀로 간세포암(HCC) 존재 확률을 추정',
  formula: [
    'logit(p) = −7.5771177 + 0.04666357×Age − 0.57611693×Sex + 0.42243533×ln(AFP [ng/mL]) + 1.1051891×ln(PIVKA-II [mAU/mL])',
    '  (Sex: male=0, female=1)',
    'p = e^logit / (1 + e^logit)',
  ].join('\n'),
  references: [
    {
      title: 'Yang T, et al. A Novel Online Calculator Based on Serum Biomarkers to Detect Hepatocellular Carcinoma among Patients with Hepatitis B. Clin Chem 2019;65(12):1543-1553',
      url: 'https://doi.org/10.1373/clinchem.2019.308965',
    },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "ASAP"',
  limitations: [
    '원 논문은 B형간염 환자 코호트에서 개발·검증됨. 다른 원인의 간질환에서는 검증되지 않음',
    'HCC 진단이 아닌 위험 확률이며, 진단은 영상·조직검사 기준을 따라야 함',
    '와파린 등 비타민K 길항제, 비타민K 결핍, 폐쇄성 황달은 PIVKA-II를 상승시켜 결과를 왜곡함',
    'AFP·PIVKA-II 검사법(제조사·단위 mAU/mL)이 원 논문과 다르면 계수가 맞지 않을 수 있음',
  ],
  input: z.object({
    age: adultAgeYears.clone().meta({ example: 55 }),
    sex,
    afp: positive('알파태아단백 (AFP)', 'ng/mL', 20),
    pivkaII: positive('PIVKA-II (DCP)', 'mAU/mL', 40),
    precision: precision(3),
  }),
  output: z.object({
    probability: z.number().min(0).max(1).describe('HCC 확률 (0–1)'),
    percent: z.number().describe('HCC 확률 [%]'),
    logit: z.number().describe('선형 예측값'),
  }),
  example: { age: 55, sex: 'M', afp: 20, pivkaII: 40 },
  compute: ({ age, sex, afp, pivkaII, precision }) => {
    const logit = asapLogit(age, sex === 'F', afp, pivkaII);
    const p = D(Math.exp(logit)).div(D(1).plus(Math.exp(logit)));
    return { probability: fix(p, precision), percent: fix(p.times(100), Math.max(precision - 2, 0)), logit: fix(logit, 4) };
  },
});
