import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { fix } from '../core/num';
import { positive, precision } from '../core/schemas';
import { mostellerBsa } from '../domain/anthropometry';

export function duBoisBsa(heightCm: number, weightKg: number): number {
  return 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
}

export default defineCalculator({
  code: 'BSA',
  name: 'Body Surface Area',
  category: 'chemistry',
  summary: '체표면적. 기본 Du Bois(레거시 MedCal과 동일), Mosteller 선택 가능',
  formula: [
    'Du Bois   : BSA [m²] = 0.007184 × Height[cm]^0.725 × Weight[kg]^0.425',
    'Mosteller : BSA [m²] = √(Height[cm] × Weight[kg] / 3600)',
  ].join('\n'),
  references: [
    { title: 'Du Bois D, Du Bois EF. A formula to estimate the approximate surface area if height and weight be known. Arch Intern Med 1916;17:863-71' },
    { title: 'Mosteller RD. Simplified calculation of body-surface area. N Engl J Med 1987;317(17):1098', url: 'https://doi.org/10.1056/NEJM198710223171717' },
  ],
  legacySource: 'M.OCS.MedCal/fmMedCal.vb › EN_Calculate.BSA (Du Bois)',
  limitations: [
    '항암제 용량 산정 시 기관 프로토콜이 지정한 공식·상한(예: BSA 2.0 m² 캡)을 따라야 함',
    'Du Bois는 극단 체형(고도비만·소아)에서 오차가 커짐',
  ],
  input: z.object({
    weightKg: positive('체중', 'kg', 70),
    heightCm: positive('신장', 'cm', 175),
    method: z.enum(['DU_BOIS', 'MOSTELLER']).default('DU_BOIS'),
    precision: precision(2),
  }),
  output: z.object({ bsa: z.number().describe('[m²]'), method: z.enum(['DU_BOIS', 'MOSTELLER']) }),
  example: { weightKg: 70, heightCm: 175 },
  compute: ({ weightKg, heightCm, method, precision }) => ({
    bsa: fix(method === 'DU_BOIS' ? duBoisBsa(heightCm, weightKg) : mostellerBsa(heightCm, weightKg), precision),
    method,
  }),
});
