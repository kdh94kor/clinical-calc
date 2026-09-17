import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'ANION_GAP',
  name: 'Anion Gap',
  category: 'chemistry',
  summary: '혈청 음이온차 = Na − (Cl + HCO₃). 칼륨 포함 여부 선택 가능(레거시는 미포함)',
  formula: 'AG [mEq/L] = Na − (Cl + HCO₃)      (includePotassium=true 이면 (Na + K) − (Cl + HCO₃))',
  references: [
    {
      title: 'Kraut JA, Madias NE. Serum anion gap: its uses and limitations in clinical medicine. Clin J Am Soc Nephrol 2007;2(1):162-74',
      url: 'https://doi.org/10.2215/CJN.03020906',
    },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.AniGap ("Na - (Cl+HCO3)")',
  limitations: [
    '정상 범위는 검사 장비·방법에 따라 다름(대략 8–12 mEq/L, K 포함 시 12–16). 기관별 참고치로 해석',
    '저알부민혈증에서는 음이온차가 과소평가됨(알부민 1 g/dL 감소당 약 2.5 mEq/L 보정 필요)',
  ],
  input: z.object({
    sodium: positive('나트륨 (Na)', 'mEq/L', 140),
    chloride: positive('염소 (Cl)', 'mEq/L', 104),
    bicarbonate: positive('중탄산염 (HCO₃)', 'mEq/L', 24),
    potassium: positive('칼륨 (K)', 'mEq/L', 4.0).optional(),
    includePotassium: z.boolean().default(false).describe('true면 (Na+K) 공식 사용. potassium 필수'),
    precision: precision(1),
  }).refine((v) => !v.includePotassium || v.potassium !== undefined, {
    path: ['potassium'],
    message: 'potassium is required when includePotassium is true',
  }),
  output: z.object({ anionGap: z.number().describe('음이온차 [mEq/L]'), includesPotassium: z.boolean() }),
  example: { sodium: 140, chloride: 104, bicarbonate: 24 },
  compute: ({ sodium, chloride, bicarbonate, potassium, includePotassium, precision }) => {
    const cations = includePotassium ? D(sodium).plus(potassium ?? 0) : D(sodium);
    return { anionGap: fix(cations.minus(chloride).minus(bicarbonate), precision), includesPotassium: includePotassium };
  },
});
