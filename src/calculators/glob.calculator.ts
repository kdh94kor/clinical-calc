import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

const input = z
  .object({
    totalProtein: positive('총단백 (Total Protein)', 'g/dL', 7.2),
    albumin: positive('알부민 (Albumin)', 'g/dL', 4.3),
    precision: precision(1),
  })
  .refine((v) => v.albumin <= v.totalProtein, { path: ['albumin'], message: 'albumin must not exceed totalProtein' });

export default defineCalculator({
  code: 'GLOB',
  name: 'Globulin (계산치)',
  category: 'chemistry',
  summary: '총단백에서 알부민을 뺀 글로불린 농도',
  formula: 'Globulin [g/dL] = Total Protein [g/dL] − Albumin [g/dL]',
  references: [
    { title: 'Rifai N, et al. Tietz Textbook of Laboratory Medicine, 7th ed. Elsevier 2022. Ch. Serum Proteins' },
  ],
  legacySource: 'M.LAB.LabRstManager/fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "GLOB"',
  input,
  output: z.object({ globulin: z.number().describe('글로불린 [g/dL]') }),
  example: { totalProtein: 7.2, albumin: 4.3 },
  compute: ({ totalProtein, albumin, precision }) => ({
    globulin: fix(D(totalProtein).minus(albumin), precision),
  }),
});
