import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, div, fix } from '../core/num';
import { adultAgeYears, positive, precision } from '../core/schemas';

/** NAFLD 진행성 섬유화 판정 컷오프 (Shah 2009; AASLD 2023) */
export const FIB4_LOW = 1.3;
export const FIB4_HIGH = 2.67;

export function interpretFib4(score: number): 'low' | 'indeterminate' | 'high' {
  if (score < FIB4_LOW) return 'low';
  if (score > FIB4_HIGH) return 'high';
  return 'indeterminate';
}

export default defineCalculator({
  code: 'FIB4',
  name: 'FIB-4 Index',
  category: 'hepatology',
  summary: '나이·AST·ALT·혈소판으로 간 섬유화 정도를 추정하는 비침습 지표. 컷오프 <1.30 low / >2.67 high (NAFLD 기준)',
  formula: 'FIB-4 = (Age [years] × AST [U/L]) / (Platelets [10⁹/L] × √ALT [U/L])',
  references: [
    {
      title: 'Sterling RK, et al. Development of a simple noninvasive index to predict significant fibrosis in patients with HIV/HCV coinfection. Hepatology 2006;43(6):1317-25',
      url: 'https://doi.org/10.1002/hep.21178',
    },
    {
      title: 'Shah AG, et al. Comparison of noninvasive markers of fibrosis in patients with nonalcoholic fatty liver disease. Clin Gastroenterol Hepatol 2009;7(10):1104-12',
      url: 'https://doi.org/10.1016/j.cgh.2009.05.033',
      note: 'cut-offs 1.30 / 2.67',
    },
    {
      title: 'Rinella ME, et al. AASLD Practice Guidance on the clinical assessment and management of NAFLD. Hepatology 2023;77(5):1797-1835',
      url: 'https://doi.org/10.1097/HEP.0000000000000323',
    },
  ],
  legacySource: 'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "FIB4"',
  limitations: [
    '선별 지표이며 조직검사·영상 탄성도 검사를 대체하지 않음. indeterminate 구간(1.30–2.67)은 추가 검사 필요',
    '판정 컷오프 1.30/2.67은 NAFLD 성인 기준. 65세 이상은 하한 컷오프 2.0 권고(McPherson 2017), 35세 미만은 위음성 증가',
    '급성 간염·간외 원인의 AST/ALT 상승, 혈소판 감소를 동반한 혈액질환에서는 해석 불가',
    '원 논문(Sterling 2006)은 HIV/HCV 동반감염 코호트에서 도출됨',
  ],
  input: z.object({
    age: adultAgeYears.clone().meta({ example: 60 }),
    ast: positive('AST', 'U/L', 40),
    alt: positive('ALT', 'U/L', 40),
    platelets: positive('혈소판 수', '10⁹/L (= 10³/µL)', 150),
    precision: precision(2),
  }),
  output: z.object({
    fib4: z.number().describe('FIB-4 index (무단위)'),
    interpretation: z.enum(['low', 'indeterminate', 'high']).describe('진행성 섬유화 위험 (NAFLD 컷오프 1.30/2.67)'),
  }),
  example: { age: 60, ast: 40, alt: 40, platelets: 150 },
  compute: ({ age, ast, alt, platelets, precision }) => {
    const score = fix(div(D(age).times(ast), D(platelets).times(D(alt).sqrt()), 'platelets × √ALT'), precision);
    return { fib4: score, interpretation: interpretFib4(score) };
  },
});
