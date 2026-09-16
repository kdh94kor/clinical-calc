import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { div, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'BCRATIO',
  name: 'BUN/Creatinine Ratio',
  category: 'renal',
  summary: '혈중요소질소 ÷ 혈청 크레아티닌 (신전성/신성 감별 보조)',
  formula: 'BUN/Cr = BUN [mg/dL] / Creatinine [mg/dL]',
  references: [
    { title: 'Rifai N, et al. Tietz Textbook of Laboratory Medicine, 7th ed. Elsevier 2022. Ch. Kidney Function Tests' },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "BCRATIO"',
  input: z.object({
    bun: positive('혈중요소질소 (BUN)', 'mg/dL', 14),
    creatinine: positive('혈청 크레아티닌', 'mg/dL', 0.9),
    precision: precision(1),
  }),
  output: z.object({ bunCreatinineRatio: z.number().describe('BUN/Cr 비 (무단위)') }),
  example: { bun: 14, creatinine: 0.9 },
  compute: ({ bun, creatinine, precision }) => ({
    bunCreatinineRatio: fix(div(bun, creatinine, 'creatinine'), precision),
  }),
});
