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
  limitations: [
    '미성숙 세포(Blasts)나 유핵적혈구(NRBC)가 다수 출현하는 골수 질환·중증 감염에서는 수기 감별계산(Manual diff)으로 재확인해야 합니다.',
    '극심한 백혈구 감소증(WBC < 1.0 × 10³/µL) 상태에서는 분율 오차가 커질 수 있습니다.',
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "ANC", "ANC_2"',
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
