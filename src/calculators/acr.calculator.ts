import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { div, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

/** KDIGO 알부민뇨 카테고리 (mg/g) */
export function albuminuriaCategory(acrMgG: number): 'A1' | 'A2' | 'A3' {
  if (acrMgG < 30) return 'A1';
  if (acrMgG <= 300) return 'A2';
  return 'A3';
}

export default defineCalculator({
  code: 'ACR',
  name: 'Urine Albumin/Creatinine Ratio',
  category: 'urine',
  summary:
    '소변 미세알부민(mg/L) ÷ 소변 크레아티닌(mg/dL) → mg/g. 단위 환산 계수 100 (mg/L ÷ (mg/dL×10) × 1000). 레거시 규칙대로 기본 버림(floor)',
  formula: 'UACR [mg/g] = Urine Albumin [mg/L] / Urine Creatinine [mg/dL] × 100',
  references: [
    {
      title: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD. Kidney Int 2024;105(4S):S117-S314',
      url: 'https://kdigo.org/guidelines/ckd-evaluation-and-management/',
      note: 'A1 <30, A2 30–300, A3 >300 mg/g',
    },
  ],
  legacySource:
    'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "ACR" (코드 ×100; 주석의 ×1000은 오기)',
  limitations: [
    '입력 단위는 알부민 mg/L, 크레아티닌 mg/dL 로 고정. 다른 단위 입력 시 결과가 10배 단위로 틀림',
    '일회성 상승은 운동·발열·요로감염·월경·심부전 등으로 생길 수 있어, KDIGO는 3개월 내 3회 중 2회 이상 확인을 권고함',
    '기본 버림(floor) 처리는 검사실 보고 규정을 따른 것이며 통계·연구 목적에는 roundingMode=round 사용',
  ],
  input: z.object({
    urineMicroalbumin: positive('소변 미세알부민', 'mg/L', 25),
    urineCreatinine: positive('소변 크레아티닌', 'mg/dL', 120),
    roundingMode: z.enum(['floor', 'round']).default('floor').describe('소수 처리 방식 (레거시 기본 floor)'),
    precision: precision(0),
  }),
  output: z.object({
    albuminCreatinineRatio: z.number().describe('UACR [mg/g]'),
    kdigoCategory: z.enum(['A1', 'A2', 'A3']).describe('KDIGO 알부민뇨 카테고리'),
  }),
  example: { urineMicroalbumin: 25, urineCreatinine: 120 },
  compute: ({ urineMicroalbumin, urineCreatinine, roundingMode, precision }) => {
    const acr = fix(div(urineMicroalbumin, urineCreatinine, 'urineCreatinine').times(100), precision, roundingMode);
    return { albuminCreatinineRatio: acr, kdigoCategory: albuminuriaCategory(acr) };
  },
});
