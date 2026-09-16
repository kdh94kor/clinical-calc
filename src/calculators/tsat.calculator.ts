import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { div, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'TSAT',
  name: 'Transferrin Saturation',
  category: 'hematology',
  summary: '혈청 철 ÷ 총철결합능 × 100 (%)',
  formula: 'TSAT [%] = Serum Iron [µg/dL] / TIBC [µg/dL] × 100',
  references: [
    {
      title: 'KDIGO Clinical Practice Guideline for Anemia in Chronic Kidney Disease. Kidney Int Suppl 2012;2(4):279-335',
      url: 'https://kdigo.org/guidelines/anemia-in-ckd/',
    },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "TSAT"',
  input: z.object({
    iron: positive('혈청 철 (Fe)', 'µg/dL', 80),
    tibc: positive('총철결합능 (TIBC)', 'µg/dL', 300),
    precision: precision(1),
  }),
  output: z.object({ transferrinSaturation: z.number().describe('TSAT [%]') }),
  example: { iron: 80, tibc: 300 },
  compute: ({ iron, tibc, precision }) => ({
    transferrinSaturation: fix(div(iron, tibc, 'tibc').times(100), precision),
  }),
});
