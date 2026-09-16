import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

/** 농도 단위 → (1일 배설량 단위, 나누는 값). 레거시: 전해질 /1000, 화학 mg/dL /100 */
const UNIT_TABLE = {
  'mmol/L': { outUnit: 'mmol/day', divisor: 1000 },
  'mg/dL': { outUnit: 'mg/day', divisor: 100 },
  'mg/L': { outUnit: 'mg/day', divisor: 1000 },
  'g/L': { outUnit: 'g/day', divisor: 1000 },
  'U/L': { outUnit: 'U/day', divisor: 1000 },
} as const;

export default defineCalculator({
  code: 'URINE_24H',
  name: '24-hour Urine Excretion',
  category: 'urine',
  summary: '24시간 소변 정량: 농도 × 총 소변량. 농도 단위에 따라 환산 계수를 자동 결정 (Na/K/Cl/Amylase/Glu/UUN/UCr/Ca/P/Mg/UA/TPro/MAlb 공용)',
  formula: 'Amount/day = Concentration × Total Volume [mL] / divisor   (mmol/L,mg/L,g/L,U/L → 1000 ; mg/dL → 100)',
  references: [
    { title: 'Rifai N, et al. Tietz Textbook of Laboratory Medicine, 7th ed. Elsevier 2022. Ch. Urinalysis / Timed urine collections' },
  ],
  legacySource:
    'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "24URINE_NA/K/CL/AMYL" (/1000), "24URINE_GLU/UUN/UCR/CA/P/MG/UA/TPRO/MALB" (/DIVIDE_VALUE, 기본 100)',
  input: z.object({
    concentration: positive('검체 농도', 'per concentrationUnit', 120),
    concentrationUnit: z.enum(['mmol/L', 'mg/dL', 'mg/L', 'g/L', 'U/L']).describe('농도 단위'),
    totalVolumeMl: positive('24시간 총 소변량', 'mL', 1500),
    precision: precision(1),
  }),
  output: z.object({
    amountPerDay: z.number().describe('1일 배설량'),
    unit: z.enum(['mmol/day', 'mg/day', 'g/day', 'U/day']),
  }),
  example: { concentration: 120, concentrationUnit: 'mmol/L', totalVolumeMl: 1500 },
  compute: ({ concentration, concentrationUnit, totalVolumeMl, precision }) => {
    const { outUnit, divisor } = UNIT_TABLE[concentrationUnit];
    return { amountPerDay: fix(D(concentration).times(totalVolumeMl).div(divisor), precision), unit: outUnit };
  },
});
