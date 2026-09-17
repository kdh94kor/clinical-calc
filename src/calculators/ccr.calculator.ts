import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { fix } from '../core/num';
import { ageYears, positive, precision, sex } from '../core/schemas';
import { cockcroftGault } from '../domain/renal';

export default defineCalculator({
  code: 'CCR',
  name: 'Creatinine Clearance (Cockcroft-Gault)',
  category: 'renal',
  summary: '실제 체중 기반 Cockcroft-Gault 추정 크레아티닌 청소율',
  formula: 'CrCl [mL/min] = (140 − Age) × Weight [kg] / (72 × SCr [mg/dL])  × 0.85 (female)',
  references: [
    {
      title: 'Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. Nephron 1976;16(1):31-41',
      url: 'https://doi.org/10.1159/000180580',
    },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "CCR" (체중 = moDTO.GetPatWeight)',
  limitations: [
    '실제 체중을 그대로 사용함. 비만·부종 환자는 과대추정될 수 있어 이상체중/보정체중 적용 여부는 임상적으로 판단',
    '안정된 신기능 전제. 급성 신손상 시 부정확',
    '원 논문은 성인 남성 중심 코호트에서 도출됨. 소아·고령·근육량 극단에서 신뢰도 저하',
  ],
  input: z.object({
    age: ageYears.clone().meta({ example: 65 }),
    sex,
    weightKg: positive('체중', 'kg', 70),
    serumCreatinine: positive('혈청 크레아티닌', 'mg/dL', 1.0),
    precision: precision(1),
  }),
  output: z.object({ creatinineClearance: z.number().describe('CrCl [mL/min]') }),
  example: { age: 65, sex: 'M', weightKg: 70, serumCreatinine: 1.0 },
  compute: ({ age, sex, weightKg, serumCreatinine, precision }) => ({
    creatinineClearance: fix(cockcroftGault({ age, sex, weightKg, scrMgDl: serumCreatinine }), precision),
  }),
});
