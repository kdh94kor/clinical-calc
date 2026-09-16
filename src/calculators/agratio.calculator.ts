import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, div, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

const input = z
  .object({
    albumin: positive('알부민 (Albumin)', 'g/dL', 4.3),
    totalProtein: positive('총단백 (Total Protein)', 'g/dL', 7.2),
    precision: precision(2),
  })
  .refine((v) => v.albumin < v.totalProtein, {
    path: ['albumin'],
    message: 'albumin must be less than totalProtein (globulin would be zero or negative)',
  });

export default defineCalculator({
  code: 'AGRATIO',
  name: 'Albumin/Globulin Ratio',
  category: 'chemistry',
  summary: '알부민 ÷ 글로불린(총단백 − 알부민)',
  formula: 'A/G = Albumin / (Total Protein − Albumin)',
  references: [
    { title: 'Rifai N, et al. Tietz Textbook of Laboratory Medicine, 7th ed. Elsevier 2022. Ch. Serum Proteins' },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "AGRATIO"',
  input,
  output: z.object({ agRatio: z.number().describe('A/G 비 (무단위)') }),
  example: { albumin: 4.3, totalProtein: 7.2 },
  compute: ({ albumin, totalProtein, precision }) => ({
    agRatio: fix(div(albumin, D(totalProtein).minus(albumin), 'globulin'), precision),
  }),
});
