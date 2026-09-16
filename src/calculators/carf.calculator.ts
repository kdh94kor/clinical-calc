import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { div, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'CARF',
  name: 'Cardiac Risk Factor (TC/HDL, Castelli Index I)',
  category: 'risk-score',
  summary: '총콜레스테롤 ÷ HDL 콜레스테롤 비 (Castelli Risk Index I)',
  formula: 'CRF = Total Cholesterol [mg/dL] / HDL-C [mg/dL]',
  references: [
    {
      title: 'Castelli WP, et al. Incidence of coronary heart disease and lipoprotein cholesterol levels: the Framingham Study. JAMA 1986;256(20):2835-8',
      url: 'https://doi.org/10.1001/jama.1986.03380200073024',
    },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "CARF"',
  input: z.object({
    totalCholesterol: positive('총콜레스테롤', 'mg/dL', 200),
    hdl: positive('HDL 콜레스테롤', 'mg/dL', 50),
    precision: precision(2),
  }),
  output: z.object({ tcHdlRatio: z.number().describe('TC/HDL 비 (무단위)') }),
  example: { totalCholesterol: 200, hdl: 50 },
  compute: ({ totalCholesterol, hdl, precision }) => ({
    tcHdlRatio: fix(div(totalCholesterol, hdl, 'hdl'), precision),
  }),
});
