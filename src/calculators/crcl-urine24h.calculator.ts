import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, div, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'CRCL_URINE_24H',
  name: 'Measured Creatinine Clearance (24h urine)',
  category: 'renal',
  summary: '24시간 소변 크레아티닌·혈청 크레아티닌·소변량으로 실측 크레아티닌 청소율 산출',
  formula: 'CrCl [mL/min] = (Urine Cr [mg/dL] / Serum Cr [mg/dL]) × Volume [mL] / Collection time [min] (24h = 1440)',
  references: [
    {
      title: 'Rifai N, et al. Tietz Textbook of Laboratory Medicine, 7th ed. Elsevier 2022. Ch. Kidney Function Tests — Clearance',
    },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "24URINE_SCR"',
  input: z.object({
    urineCreatinine: positive('소변 크레아티닌', 'mg/dL', 90),
    serumCreatinine: positive('혈청 크레아티닌', 'mg/dL', 1.0),
    totalVolumeMl: positive('총 소변량', 'mL', 1500),
    collectionMinutes: z.number().positive().default(1440).describe('채집 시간 [min] (기본 1440 = 24h)'),
    precision: precision(0),
  }),
  output: z.object({ creatinineClearance: z.number().describe('CrCl [mL/min]') }),
  example: { urineCreatinine: 90, serumCreatinine: 1.0, totalVolumeMl: 1500 },
  compute: ({ urineCreatinine, serumCreatinine, totalVolumeMl, collectionMinutes, precision }) => ({
    creatinineClearance: fix(
      div(urineCreatinine, serumCreatinine, 'serumCreatinine').times(D(totalVolumeMl).div(collectionMinutes)),
      precision,
    ),
  }),
});
