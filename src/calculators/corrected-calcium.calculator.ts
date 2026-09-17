import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'CORRECTED_CALCIUM',
  name: 'Albumin-corrected Calcium (Payne)',
  category: 'chemistry',
  summary: '저알부민혈증에서 총칼슘을 알부민 4.0 g/dL 기준으로 보정',
  formula: 'Corrected Ca [mg/dL] = Total Ca [mg/dL] + 0.8 × (4.0 − Albumin [g/dL])',
  references: [
    {
      title: 'Payne RB, et al. Interpretation of serum calcium in patients with abnormal serum proteins. BMJ 1973;4(5893):643-6',
      url: 'https://doi.org/10.1136/bmj.4.5893.643',
    },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.CorCal ("Ca + 0.8 * (4-albumin)")',
  limitations: [
    '보정식은 근사치이며, 중환자·만성 신질환·저알부민 심한 환자에서는 이온화 칼슘 직접 측정을 권고',
    '알부민 단위는 g/dL (g/L 입력 시 결과가 크게 틀림)',
  ],
  input: z.object({
    totalCalcium: positive('총칼슘', 'mg/dL', 8.0),
    albumin: positive('알부민', 'g/dL', 2.5),
    precision: precision(1),
  }),
  output: z.object({ correctedCalcium: z.number().describe('보정 칼슘 [mg/dL]') }),
  example: { totalCalcium: 8.0, albumin: 2.5 },
  compute: ({ totalCalcium, albumin, precision }) => ({
    correctedCalcium: fix(D(totalCalcium).plus(D(0.8).times(D(4).minus(albumin))), precision),
  }),
});
