import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { precision } from '../core/schemas';

const vertebra = z.number().positive().optional();

export default defineCalculator({
  code: 'BMD_LUMBAR_AVERAGE',
  name: 'Lumbar Spine BMD Average (L1–L4)',
  category: 'chemistry',
  summary: '입력된 요추 분절(L1~L4 중 1개 이상) 골밀도의 단순 평균. 제외된 분절은 자동으로 분모에서 빠짐',
  formula: 'BMD_avg [g/cm²] = Σ(입력된 L1..L4) / 입력 개수',
  references: [
    {
      title: 'ISCD Official Positions 2023 — Lumbar spine: use L1–L4; exclude vertebrae affected by structural change or artifact; use at least two vertebrae',
      url: 'https://iscd.org/official-positions-2023/',
    },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.BMD ("(L1+L2+L3+L4) / 입력값 가짓수", Round 3)',
  limitations: [
    '단순 산술평균이며 DXA 장비의 면적 가중 평균과 다를 수 있음. 공식 보고값은 장비 소프트웨어 결과를 우선',
    'ISCD는 진단에 최소 2개 분절 사용을 권고. 1개 분절만 입력한 경우 결과는 참고치',
    'T-score/Z-score 산출은 장비·인종별 참조 데이터가 필요하므로 제공하지 않음',
  ],
  input: z
    .object({
      l1: vertebra.describe('L1 BMD [g/cm²]'),
      l2: vertebra.describe('L2 BMD [g/cm²]'),
      l3: vertebra.describe('L3 BMD [g/cm²]'),
      l4: vertebra.describe('L4 BMD [g/cm²]'),
      precision: precision(3),
    })
    .refine((v) => [v.l1, v.l2, v.l3, v.l4].some((x) => x !== undefined), { message: 'at least one of l1..l4 is required' }),
  output: z.object({
    averageBmd: z.number().describe('[g/cm²]'),
    vertebraeUsed: z.number().int().describe('평균에 사용된 분절 수'),
  }),
  example: { l1: 0.95, l2: 1.0, l3: 1.05, l4: 1.1 },
  compute: ({ l1, l2, l3, l4, precision }) => {
    const used = [l1, l2, l3, l4].filter((x): x is number => x !== undefined);
    const sum = used.reduce((acc, x) => acc.plus(x), D(0));
    return { averageBmd: fix(sum.div(used.length), precision), vertebraeUsed: used.length };
  },
});
