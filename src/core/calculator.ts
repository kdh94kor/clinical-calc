import type { z } from 'zod';

export type Category =
  | 'chemistry'
  | 'lipid'
  | 'hematology'
  | 'renal'
  | 'hepatology'
  | 'urine'
  | 'pharmacokinetics'
  | 'risk-score';

export interface Reference {
  /** 저자. 제목. 학술지 연도;권(호):쪽 또는 가이드라인 명 */
  title: string;
  url?: string;
  note?: string;
}

/**
 * 계산기 전략(Strategy) 계약. 파일 하나 = 계산기 하나.
 * src/calculators/<name>.calculator.ts 에서 default export 하면 레지스트리가 부팅 시 자동 등록한다.
 */
export interface CalculatorDefinition<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  /** URL 세그먼트. UPPER_SNAKE, 전역 유일 */
  code: string;
  name: string;
  summary: string;
  category: Category;
  /** 사람이 읽는 산출식 (Swagger description에 노출) */
  formula: string;
  references: Reference[];
  /** 적용 불가 상황 및 임상적 한계 (Swagger 및 GET 메타데이터에 노출) */
  limitations?: string[];
  /** 마이그레이션 출처 (레거시 파일/함수) */
  legacySource?: string;
  input: I;
  output: O;
  /** Swagger 예시 요청 본문 */
  example?: z.input<I>;
  /** 검증 완료된 입력만 받는다. 0 나누기 등은 CalcError로 던진다. */
  compute: (input: z.output<I>) => z.output<O>;
}

export function defineCalculator<I extends z.ZodType, O extends z.ZodType>(
  def: CalculatorDefinition<I, O>,
): CalculatorDefinition<I, O> {
  if (!/^[A-Z][A-Z0-9_]*$/.test(def.code)) {
    throw new Error(`Invalid calculator code "${def.code}" (UPPER_SNAKE only)`);
  }
  if (def.references.length === 0) throw new Error(`Calculator ${def.code} must cite at least one reference`);
  return def;
}
