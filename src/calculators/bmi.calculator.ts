import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { fix } from '../core/num';
import { positive, precision } from '../core/schemas';
import { bodyMassIndex } from '../domain/anthropometry';

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese_1' | 'obese_2' | 'obese_3';

/** WHO 아시아-태평양 기준 (대한비만학회 2022 동일) */
export function bmiCategoryAsiaPacific(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 23) return 'normal';
  if (bmi < 25) return 'overweight';
  if (bmi < 30) return 'obese_1';
  if (bmi < 35) return 'obese_2';
  return 'obese_3';
}

export default defineCalculator({
  code: 'BMI',
  name: 'Body Mass Index',
  category: 'chemistry',
  summary: '체질량지수와 대한비만학회(아시아-태평양) 비만 분류',
  formula: 'BMI [kg/m²] = Weight [kg] / (Height [m])²',
  references: [
    { title: 'WHO Expert Consultation. Appropriate body-mass index for Asian populations. Lancet 2004;363(9403):157-63', url: 'https://doi.org/10.1016/S0140-6736(03)15268-3' },
    { title: '대한비만학회. 비만 진료지침 2022 (8판) — 저체중 <18.5, 정상 18.5–22.9, 비만전단계 23–24.9, 1단계 25–29.9, 2단계 30–34.9, 3단계 ≥35' },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.BMI',
  limitations: [
    '분류는 성인(≥19세) 아시아-태평양 기준. 소아·청소년은 성장도표 백분위 사용',
    '근육량이 많은 사람·노인·임신부에서는 체지방을 반영하지 못함',
  ],
  input: z.object({
    weightKg: positive('체중', 'kg', 70),
    heightCm: positive('신장', 'cm', 175),
    precision: precision(1),
  }),
  output: z.object({
    bmi: z.number().describe('[kg/m²]'),
    category: z.enum(['underweight', 'normal', 'overweight', 'obese_1', 'obese_2', 'obese_3']).describe('대한비만학회 분류'),
  }),
  example: { weightKg: 70, heightCm: 175 },
  compute: ({ weightKg, heightCm, precision }) => {
    const bmi = fix(bodyMassIndex(heightCm, weightKg), precision);
    return { bmi, category: bmiCategoryAsiaPacific(bmi) };
  },
});
