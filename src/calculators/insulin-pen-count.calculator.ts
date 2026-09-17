import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

/** 펜 1개당 인슐린 단위 수 */
export const UNITS_PER_PEN = { U100_3ML: 300, U300_3ML: 450, U200_3ML: 600, U100_1_5ML: 150 } as const;

export default defineCalculator({
  code: 'INSULIN_PEN_COUNT',
  name: 'Insulin Pen Count for Prescription',
  category: 'pharmacokinetics',
  summary: '1일 인슐린 필요량 × 처방일수를 펜 1개 용량으로 나눠 처방 펜 개수 산출 (레거시 U300/U100 두 탭 통합)',
  formula: 'pens = ceil( Daily units [IU] × Days / Units per pen )     (U100 3 mL = 300 IU, U300 1.5 mL = 450 IU, U200 3 mL = 600 IU, U100 1.5 mL = 150 IU)',
  references: [
    { title: '식품의약품안전처 의약품 허가사항 — 인슐린 글라진 U100(란투스 솔로스타 3 mL, 300 IU), U300(투제오 솔로스타 1.5 mL, 450 IU)' },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.InsulinU300 (/450), InsulinU100 (/300)',
  limitations: [
    '펜 개수는 올림(ceil)이며, 프라이밍(공기빼기) 손실·개봉 후 사용기한(대개 28일)은 반영하지 않음. 장기 처방 시 개봉기한으로 인한 추가 펜 필요 여부는 별도 판단',
    '레거시는 소수 2자리 값을 그대로 표시했음. 본 API는 정수 pens 와 소수 pensExact 를 함께 반환',
  ],
  input: z.object({
    dailyUnits: positive('1일 인슐린 필요량', 'IU', 40),
    days: z.number().int().positive().describe('처방일수 [day]').meta({ example: 30 }),
    penType: z.enum(['U100_3ML', 'U300_3ML', 'U200_3ML', 'U100_1_5ML']).describe('펜 규격'),
    precision: precision(2),
  }),
  output: z.object({
    pens: z.number().int().describe('처방 펜 개수 (올림)'),
    pensExact: z.number().describe('올림 전 값'),
    totalUnits: z.number().describe('총 필요 단위 [IU]'),
    unitsPerPen: z.number(),
  }),
  example: { dailyUnits: 40, days: 30, penType: 'U100_3ML' },
  compute: ({ dailyUnits, days, penType, precision }) => {
    const total = D(dailyUnits).times(days);
    const exact = total.div(UNITS_PER_PEN[penType]);
    return {
      pens: exact.ceil().toNumber(),
      pensExact: fix(exact, precision),
      totalUnits: fix(total, precision),
      unitsPerPen: UNITS_PER_PEN[penType],
    };
  },
});
