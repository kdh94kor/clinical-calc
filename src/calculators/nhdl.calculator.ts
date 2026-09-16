import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

const input = z
  .object({
    totalCholesterol: positive('총콜레스테롤', 'mg/dL', 200),
    hdl: positive('HDL 콜레스테롤', 'mg/dL', 50),
    precision: precision(0),
  })
  .refine((v) => v.hdl <= v.totalCholesterol, { path: ['hdl'], message: 'hdl must not exceed totalCholesterol' });

export default defineCalculator({
  code: 'NHDL',
  name: 'Non-HDL Cholesterol',
  category: 'lipid',
  summary: '총콜레스테롤에서 HDL을 뺀 비-HDL 콜레스테롤 (모든 죽상경화성 지단백 총량)',
  formula: 'Non-HDL-C [mg/dL] = Total Cholesterol [mg/dL] − HDL-C [mg/dL]',
  references: [
    {
      title:
        'Grundy SM, et al. 2018 AHA/ACC Guideline on the Management of Blood Cholesterol. Circulation 2019;139:e1082–e1143',
      url: 'https://doi.org/10.1161/CIR.0000000000000625',
    },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "NHDL", "NHDL_2"',
  input,
  output: z.object({ nonHdlCholesterol: z.number().describe('Non-HDL-C [mg/dL]') }),
  example: { totalCholesterol: 200, hdl: 50 },
  compute: ({ totalCholesterol, hdl, precision }) => ({
    nonHdlCholesterol: fix(D(totalCholesterol).minus(hdl), precision),
  }),
});
