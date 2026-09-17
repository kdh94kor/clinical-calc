import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

/** 포도당 100 mg/dL 상승당 Na 보정량 (mEq/L) */
export const SODIUM_CORRECTION_FACTOR = { KATZ: 1.6, HILLIER: 2.4, LEGACY_1_0: 1.0 } as const;

export default defineCalculator({
  code: 'CORRECTED_SODIUM',
  name: 'Glucose-corrected Sodium',
  category: 'chemistry',
  summary:
    '고혈당에 의한 희석성 저나트륨혈증 보정. 기본 Katz(1.6/100 mg/dL). 레거시 MedCal은 계수 1.0을 사용했으며 LEGACY_1_0으로 재현 가능',
  formula: 'Corrected Na [mEq/L] = Na + factor × (Glucose [mg/dL] − 100) / 100     (factor: KATZ 1.6, HILLIER 2.4, LEGACY_1_0 1.0)',
  references: [
    { title: 'Katz MA. Hyperglycemia-induced hyponatremia—calculation of expected serum sodium depression. N Engl J Med 1973;289(16):843-4', url: 'https://doi.org/10.1056/NEJM197310182891607' },
    { title: 'Hillier TA, Abbott RD, Barrett EJ. Hyponatremia: evaluating the correction factor for hyperglycemia. Am J Med 1999;106(4):399-403', url: 'https://doi.org/10.1016/S0002-9343(99)00055-8' },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.Corna ("Na + (glucose-100)/100" — 계수 1.0)',
  limitations: [
    '레거시 계수 1.0은 표준 문헌(1.6 또는 2.4)과 다르므로 기본값을 Katz 1.6으로 변경함. 기존 값 재현이 필요하면 method=LEGACY_1_0',
    '포도당 400 mg/dL 초과에서는 Hillier 2.4가 더 정확하다는 보고가 있음',
    '포도당 100 mg/dL 미만이면 보정하지 않음(음의 보정 방지)',
  ],
  input: z.object({
    sodium: positive('혈청 나트륨', 'mEq/L', 130),
    glucose: positive('혈당', 'mg/dL', 600),
    method: z.enum(['KATZ', 'HILLIER', 'LEGACY_1_0']).default('KATZ').describe('보정 계수 선택'),
    precision: precision(1),
  }),
  output: z.object({
    correctedSodium: z.number().describe('보정 Na [mEq/L]'),
    correctionApplied: z.number().describe('보정량 [mEq/L]'),
    method: z.enum(['KATZ', 'HILLIER', 'LEGACY_1_0']),
  }),
  example: { sodium: 130, glucose: 600 },
  compute: ({ sodium, glucose, method, precision }) => {
    const excess = Math.max(glucose - 100, 0);
    const corr = D(SODIUM_CORRECTION_FACTOR[method]).times(excess).div(100);
    return { correctedSodium: fix(D(sodium).plus(corr), precision), correctionApplied: fix(corr, precision), method };
  },
});
