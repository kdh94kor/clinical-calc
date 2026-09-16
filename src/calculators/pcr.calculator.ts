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
  limitations: [
    '육안적 혈뇨, 요로 감염(UTI), 격렬한 운동, 급성 발열 상태에서는 일시적 단백뇨가 발생하므로 평가에 부적합합니다.',
    '다발 골수종(Multiple Myeloma) 등 비알부민성 단백뇨(벤스-존스 단백 등)는 통상 시험지봉 검사에서 음성으로 나올 수 있어 주의가 필요합니다.',
    '기립성 단백뇨 의심 시 아침 첫 소변 검체로 재검해야 합니다.',
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "PCR" (Math.Floor)',
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
