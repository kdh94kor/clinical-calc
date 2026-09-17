import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

/**
 * Young's rule / Clark's rule — 성인 용량에 대한 소아 분율.
 * 레거시 MedCal의 Young(Age/(Age+12))·Clark(Weight/70) 두 탭을 rule 선택으로 통합.
 */
export default defineCalculator({
  code: 'PEDIATRIC_DOSE_FRACTION',
  name: "Pediatric Dose Fraction (Young's / Clark's rule)",
  category: 'pharmacokinetics',
  summary: '성인 용량 대비 소아 용량 분율. Young(나이 기반) 또는 Clark(체중 기반). adultDose를 주면 소아 용량까지 산출',
  formula: [
    "Young's rule : fraction = Age[years] / (Age + 12)",
    "Clark's rule : fraction = Weight[kg] / 70          (원전은 lb/150; 레거시와 동일하게 kg/70 사용)",
    'Pediatric dose = Adult dose × fraction',
  ].join('\n'),
  references: [
    { title: 'Lack JA, Stuart-Taylor ME. Calculation of drug dosage and body surface area of children. Br J Anaesth 1997;78(5):601-5', url: 'https://doi.org/10.1093/bja/78.5.601' },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.Young ("Age/(Age+12)"), EN_Calculate.Clack ("Weight/70")',
  limitations: [
    '역사적 근사 규칙이며 현대 소아 처방은 약물별 mg/kg 또는 mg/m² 용량을 우선함. 약전·소아 처방집에 용량이 있으면 그것을 사용',
    "Young's rule은 1–12세, 신생아·영아에는 부적합",
    '치료 범위가 좁은 약물(디곡신, 아미노글리코사이드 등)에는 사용 금지',
  ],
  input: z
    .object({
      rule: z.enum(['YOUNG', 'CLARK']).describe('YOUNG=나이 기반, CLARK=체중 기반'),
      ageYears: z.number().min(0).max(18).optional().describe('만 나이 [years] (YOUNG 필수)'),
      weightKg: positive('체중', 'kg', 20).optional().describe('체중 [kg] (CLARK 필수)'),
      adultDose: positive('성인 1회 용량', 'any unit', 500).optional(),
      precision: precision(3),
    })
    .refine((v) => v.rule !== 'YOUNG' || v.ageYears !== undefined, { path: ['ageYears'], message: 'ageYears is required for YOUNG rule' })
    .refine((v) => v.rule !== 'CLARK' || v.weightKg !== undefined, { path: ['weightKg'], message: 'weightKg is required for CLARK rule' }),
  output: z.object({
    fraction: z.number().describe('성인 용량 대비 분율 (0–1)'),
    pediatricDose: z.number().nullable().describe('adultDose × fraction (adultDose 미입력 시 null)'),
    rule: z.enum(['YOUNG', 'CLARK']),
  }),
  example: { rule: 'YOUNG', ageYears: 6, adultDose: 500 },
  compute: ({ rule, ageYears, weightKg, adultDose, precision }) => {
    const fractionD = rule === 'YOUNG' ? D(ageYears ?? 0).div(D(ageYears ?? 0).plus(12)) : D(weightKg ?? 0).div(70);
    return {
      fraction: fix(fractionD, precision),
      pediatricDose: adultDose !== undefined ? fix(fractionD.times(adultDose), precision) : null,
      rule,
    };
  },
});
