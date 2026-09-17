import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, div, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export function interpretFeNa(pct: number): 'prerenal' | 'indeterminate' | 'intrinsic' {
  if (pct < 1) return 'prerenal';
  if (pct > 2) return 'intrinsic';
  return 'indeterminate';
}

export default defineCalculator({
  code: 'FENA',
  name: 'Fractional Excretion of Sodium (FeNa)',
  category: 'renal',
  summary: '급성 신손상에서 신전성(<1%)과 신성(>2%) 원인 감별 보조 지표',
  formula: 'FeNa [%] = 100 × (Serum Cr × Urine Na) / (Serum Na × Urine Cr)',
  references: [
    {
      title: 'Espinel CH. The FENa test. Use in the differential diagnosis of acute renal failure. JAMA 1976;236(6):579-81',
      url: 'https://doi.org/10.1001/jama.1976.03270060029022',
    },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.FeNa',
  limitations: [
    '이뇨제 투여 중이면 FeNa가 신전성에서도 상승함 → FeUrea 사용 고려',
    '만성 신질환, 조영제 신병증, 사구체신염, 초기 폐쇄성 요로병증에서는 감별력이 떨어짐',
    '혈청·소변 Na와 Cr의 단위는 각각 동일해야 함(비율이므로 단위 자체는 상쇄)',
  ],
  input: z.object({
    serumCreatinine: positive('혈청 크레아티닌', 'mg/dL', 1.2),
    urineSodium: positive('소변 나트륨', 'mEq/L', 20),
    serumSodium: positive('혈청 나트륨', 'mEq/L', 140),
    urineCreatinine: positive('소변 크레아티닌', 'mg/dL', 80),
    precision: precision(2),
  }),
  output: z.object({
    feNa: z.number().describe('FeNa [%]'),
    interpretation: z.enum(['prerenal', 'indeterminate', 'intrinsic']).describe('<1% prerenal, >2% intrinsic'),
  }),
  example: { serumCreatinine: 1.2, urineSodium: 20, serumSodium: 140, urineCreatinine: 80 },
  compute: ({ serumCreatinine, urineSodium, serumSodium, urineCreatinine, precision }) => {
    const pct = fix(div(D(serumCreatinine).times(urineSodium), D(serumSodium).times(urineCreatinine), 'serumSodium × urineCreatinine').times(100), precision);
    return { feNa: pct, interpretation: interpretFeNa(pct) };
  },
});
