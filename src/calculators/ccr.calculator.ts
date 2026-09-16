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
  limitations: [
    '신기능이 급변하는 급성 신손상(AKI) 환자에게는 크레아티닌 항정상태가 아니므로 사용할 수 없습니다.',
    '비만 환자(BMI ≥ 30 또는 실제체중 > IBW 120%)의 경우 실제 체중 사용 시 신기능이 크게 과대평가되므로 이상체중(IBW) 또는 보정체중(AjBW)을 고려해야 합니다.',
    '심한 저체중, 고령 근감소증, 척수손상 환자 등에서는 혈청 Cr이 비정상적으로 낮아 과대평가 위험이 있습니다.',
    '소아·청소년 환자에게는 적용할 수 없습니다.',
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "CCR" (체중 = moDTO.GetPatWeight)',
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
