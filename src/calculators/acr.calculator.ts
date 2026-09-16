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
  limitations: [
    '육안적 혈뇨, 요로 감염(UTI), 급성 열성 질환, 격렬한 운동 직후에는 일시적 알부민뇨가 유발되므로 평가에 부적합합니다.',
    '월경혈 오염 검체는 해석할 수 없습니다.',
    '극단적인 근육량 이상(근위축, 절단, 보디빌더) 환자는 요 크레아티닌 배설량 이상으로 비율이 왜곡될 수 있습니다.',
  ],
  legacySource:
    'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "ACR" (코드 ×100; 주석의 ×1000은 오기)',
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
