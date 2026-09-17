import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'HOMA_IR',
  name: 'HOMA-IR (Insulin Resistance)',
  category: 'chemistry',
  summary: '공복 혈당과 공복 인슐린으로 인슐린 저항성 지표 산출',
  formula: 'HOMA-IR = Fasting Glucose [mg/dL] × Fasting Insulin [µU/mL] / 405',
  references: [
    {
      title: 'Matthews DR, et al. Homeostasis model assessment: insulin resistance and β-cell function from fasting plasma glucose and insulin concentrations in man. Diabetologia 1985;28(7):412-9',
      url: 'https://doi.org/10.1007/BF00280883',
    },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.HOMA ("Glucose × Insulin / 405")',
  limitations: [
    '8시간 이상 공복 검체 전제. 인슐린 치료 중인 환자에서는 해석 불가',
    '인슐린 저항성 판정 컷오프(대개 2.0–2.5)는 인구·검사법마다 달라 본 API는 판정을 제공하지 않음',
    '인슐린 단위는 µU/mL (= mIU/L). pmol/L 이면 6.945로 나눠 변환 후 입력',
  ],
  input: z.object({
    fastingGlucose: positive('공복 혈당', 'mg/dL', 100),
    fastingInsulin: positive('공복 인슐린', 'µU/mL', 10),
    precision: precision(2),
  }),
  output: z.object({ homaIr: z.number().describe('HOMA-IR (무단위)') }),
  example: { fastingGlucose: 100, fastingInsulin: 10 },
  compute: ({ fastingGlucose, fastingInsulin, precision }) => ({
    homaIr: fix(D(fastingGlucose).times(fastingInsulin).div(405), precision),
  }),
});
