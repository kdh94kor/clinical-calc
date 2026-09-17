import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

const UNIT_OUT = { 'mg/kg': 'mg', 'mcg/kg': 'mcg', 'unit/kg': 'unit', 'mL/kg': 'mL' } as const;

export default defineCalculator({
  code: 'WEIGHT_BASED_DOSE',
  name: 'Weight-based Dose',
  category: 'pharmacokinetics',
  summary: '체중 × 단위체중당 용량 = 총 용량 (레거시 MedCal "Volume" 탭)',
  formula: 'Total dose = Weight [kg] × Dose per kg',
  references: [{ title: 'Bauer LA. Applied Clinical Pharmacokinetics, 3rd ed. McGraw-Hill 2014. Ch. 1 Clinical Pharmacokinetic and Pharmacodynamic Concepts' }],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.Volume ("체중 * 단위용량", 단위 mg/kg | microgram/kg | unit/kg)',
  limitations: [
    '비만 환자는 약물에 따라 실제·이상·보정 체중 중 어떤 것을 쓰는지 다름. 호출 측이 적절한 체중을 넘겨야 함',
    '약물별 최대 용량 상한은 적용하지 않음',
  ],
  input: z.object({
    weightKg: positive('체중', 'kg', 70),
    dosePerKg: positive('단위체중당 용량', 'per doseUnit', 15),
    doseUnit: z.enum(['mg/kg', 'mcg/kg', 'unit/kg', 'mL/kg']).default('mg/kg'),
    precision: precision(2),
  }),
  output: z.object({ totalDose: z.number(), unit: z.enum(['mg', 'mcg', 'unit', 'mL']) }),
  example: { weightKg: 70, dosePerKg: 15, doseUnit: 'mg/kg' },
  compute: ({ weightKg, dosePerKg, doseUnit, precision }) => ({
    totalDose: fix(D(weightKg).times(dosePerKg), precision),
    unit: UNIT_OUT[doseUnit],
  }),
});
