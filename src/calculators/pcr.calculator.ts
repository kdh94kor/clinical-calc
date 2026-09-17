import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { div, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'PCR',
  name: 'Urine Protein/Creatinine Ratio',
  category: 'urine',
  summary: '소변 단백 ÷ 소변 크레아티닌 (mg/g). 레거시 규칙대로 기본 버림(floor) 처리',
  formula: 'UPCR [mg/g] = Urine Protein [mg/dL] / Urine Creatinine [mg/dL] × 1000',
  references: [
    {
      title: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD. Kidney Int 2024;105(4S):S117-S314',
      url: 'https://kdigo.org/guidelines/ckd-evaluation-and-management/',
    },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "PCR" (Math.Floor)',
  limitations: [
    '입력 단위는 단백·크레아티닌 모두 mg/dL 로 고정',
    '단회 소변 비율은 24시간 단백뇨의 추정치이며 근육량 극단·체위·운동 후 검체에서 오차가 커짐',
    '기본 버림(floor) 처리는 검사실 보고 규정을 따른 것',
  ],
  input: z.object({
    urineProtein: positive('소변 단백', 'mg/dL', 30),
    urineCreatinine: positive('소변 크레아티닌', 'mg/dL', 120),
    roundingMode: z.enum(['floor', 'round']).default('floor').describe('소수 처리 방식 (레거시 기본 floor)'),
    precision: precision(0),
  }),
  output: z.object({ proteinCreatinineRatio: z.number().describe('UPCR [mg/g]') }),
  example: { urineProtein: 30, urineCreatinine: 120 },
  compute: ({ urineProtein, urineCreatinine, roundingMode, precision }) => ({
    proteinCreatinineRatio: fix(div(urineProtein, urineCreatinine, 'urineCreatinine').times(1000), precision, roundingMode),
  }),
});
