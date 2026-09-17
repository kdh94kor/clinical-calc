import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'ANC',
  name: 'Absolute Neutrophil Count',
  category: 'hematology',
  summary: '백혈구 수 × 호중구 분율. 출력 단위를 10³/µL 또는 /µL 로 선택 (레거시 CALC_TYPE 1/2 대응)',
  formula: 'ANC [10³/µL] = WBC [10³/µL] × Neutrophil [%] / 100     (/µL 출력 시 × 1000)',
  references: [
    {
      title: 'Freifeld AG, et al. IDSA Clinical Practice Guideline for the Use of Antimicrobial Agents in Neutropenic Patients with Cancer. Clin Infect Dis 2011;52(4):e56-93',
      url: 'https://doi.org/10.1093/cid/cir073',
    },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "ANC", "ANC_2"',
  limitations: [
    '호중구 분율은 분절핵구+띠핵구(Seg+Band) 합계여야 함. 장비 자동분류와 수기 감별의 정의가 다를 수 있음',
    '출력 단위(10³/µL vs /µL)를 호출 측 표시 단위와 반드시 일치시켜야 함. 1000배 오차 위험',
  ],
  input: z.object({
    wbc: positive('백혈구 수 (WBC)', '10³/µL', 6.5),
    neutrophilPercent: z.number().min(0).max(100).describe('호중구 분율 (Seg + Band) [%]').meta({ example: 60 }),
    outputUnit: z.enum(['10^3/uL', '/uL']).default('10^3/uL').describe('결과 단위'),
    precision: precision(2),
  }),
  output: z.object({
    anc: z.number().describe('절대 호중구 수'),
    unit: z.enum(['10^3/uL', '/uL']),
  }),
  example: { wbc: 6.5, neutrophilPercent: 60 },
  compute: ({ wbc, neutrophilPercent, outputUnit, precision }) => {
    const k = D(wbc).times(neutrophilPercent).div(100);
    return { anc: fix(outputUnit === '/uL' ? k.times(1000) : k, precision), unit: outputUnit };
  },
});
