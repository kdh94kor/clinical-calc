import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { nonNegative, positive, precision } from '../core/schemas';

const input = z
  .object({
    totalBilirubin: positive('총빌리루빈 (Total Bilirubin)', 'mg/dL', 1.2),
    directBilirubin: nonNegative('직접빌리루빈 (Direct Bilirubin)', 'mg/dL', 0.3),
    precision: precision(1),
  })
  .refine((v) => v.directBilirubin <= v.totalBilirubin, {
    path: ['directBilirubin'],
    message: 'directBilirubin must not exceed totalBilirubin',
  });

export default defineCalculator({
  code: 'IDB',
  name: 'Indirect Bilirubin (계산치)',
  category: 'chemistry',
  summary: '총빌리루빈에서 직접(결합형)빌리루빈을 뺀 간접(비결합형)빌리루빈',
  formula: 'Indirect Bilirubin [mg/dL] = Total Bilirubin [mg/dL] − Direct Bilirubin [mg/dL]',
  references: [
    { title: 'Rifai N, et al. Tietz Textbook of Laboratory Medicine, 7th ed. Elsevier 2022. Ch. Liver Disease' },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "IDB"',
  input,
  output: z.object({ indirectBilirubin: z.number().describe('간접빌리루빈 [mg/dL]') }),
  example: { totalBilirubin: 1.2, directBilirubin: 0.3 },
  compute: ({ totalBilirubin, directBilirubin, precision }) => ({
    indirectBilirubin: fix(D(totalBilirubin).minus(directBilirubin), precision),
  }),
});
