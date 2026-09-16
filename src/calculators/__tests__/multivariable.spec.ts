/**
 * 다변수 계산기 (eGFR / FIB-4 / ASAP).
 * 기대값은 논문 공식을 순수 JS double로 독립 계산한 값 (Decimal 구현과 별개 경로).
 */
import { CalcError } from '../../core/errors';
import { registry } from '../../core/registry';

const run = <T = Record<string, unknown>>(code: string, input: unknown) => registry.run(code, input) as T;

describe('EGFR', () => {
  it('CKD-EPI 2021 기본: 남 50세 SCr 1.0 → 91.7 (G1)', () => {
    expect(run('EGFR', { serumCreatinine: 1.0, age: 50, sex: 'M' })).toEqual({
      egfr: 91.7,
      unit: 'mL/min/1.73m2',
      method: 'CKD_EPI_2021',
      ckdStage: 'G1',
    });
  });
  it('CKD-EPI 2021 여 60세 SCr 0.8 (Scr/κ > 1 분기) → 84.3 (G2)', () => {
    expect(run('EGFR', { serumCreatinine: 0.8, age: 60, sex: 'F' })).toMatchObject({ egfr: 84.3, ckdStage: 'G2' });
  });
  it('CKD-EPI 2021 남 70세 SCr 2.5 → 27.0 (G4)', () => {
    expect(run('EGFR', { serumCreatinine: 2.5, age: 70, sex: 'M' })).toMatchObject({ egfr: 27, ckdStage: 'G4' });
  });
  it('CKD-EPI 2009 남 50세 SCr 1.0 → 87.4', () => {
    expect(run('EGFR', { serumCreatinine: 1.0, age: 50, sex: 'M', method: 'CKD_EPI_2009' })).toMatchObject({ egfr: 87.4, method: 'CKD_EPI_2009' });
  });
  it('MDRD(175) 남 50세 SCr 1.0 → 79.1', () => {
    expect(run('EGFR', { serumCreatinine: 1.0, age: 50, sex: 'M', method: 'MDRD_175' })).toMatchObject({ egfr: 79.1 });
  });
  it('precision 0 → 정수', () => {
    expect(run('EGFR', { serumCreatinine: 1.0, age: 50, sex: 'M', precision: 0 })).toMatchObject({ egfr: 92 });
  });
  it('경계: SCr/κ = 1 에서 min/max 분기가 연속 (0.9 vs 0.9000001)', () => {
    const a = run<{ egfr: number }>('EGFR', { serumCreatinine: 0.9, age: 50, sex: 'M', precision: 4 }).egfr;
    const b = run<{ egfr: number }>('EGFR', { serumCreatinine: 0.9000001, age: 50, sex: 'M', precision: 4 }).egfr;
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });
  it('소아(17세) → VALIDATION_ERROR (성인 전용)', () => {
    expect(() => run('EGFR', { serumCreatinine: 1.0, age: 17, sex: 'M' })).toThrow(CalcError);
  });
  it('SCr 0 → VALIDATION_ERROR', () => {
    expect(() => run('EGFR', { serumCreatinine: 0, age: 50, sex: 'M' })).toThrow(CalcError);
  });
  it('알 수 없는 method → VALIDATION_ERROR', () => {
    expect(() => run('EGFR', { serumCreatinine: 1, age: 50, sex: 'M', method: 'SCHWARTZ' })).toThrow(CalcError);
  });
});

describe('FIB4', () => {
  it('60세, AST 40, ALT 40, PLT 150 → 2.53 (indeterminate)', () => {
    expect(run('FIB4', { age: 60, ast: 40, alt: 40, platelets: 150 })).toEqual({ fib4: 2.53, interpretation: 'indeterminate' });
  });
  it('컷오프 경계: 1.29 low / 1.30 indeterminate / 2.67 indeterminate / 2.68 high', () => {
    // age×AST/(PLT×√ALT): ALT=100(√=10), PLT=100 → score = age×AST/1000
    expect(run('FIB4', { age: 43, ast: 30, alt: 100, platelets: 100 })).toMatchObject({ fib4: 1.29, interpretation: 'low' });
    expect(run('FIB4', { age: 65, ast: 20, alt: 100, platelets: 100 })).toMatchObject({ fib4: 1.3, interpretation: 'indeterminate' });
    expect(run('FIB4', { age: 89, ast: 30, alt: 100, platelets: 100 })).toMatchObject({ fib4: 2.67, interpretation: 'indeterminate' });
    expect(run('FIB4', { age: 67, ast: 40, alt: 100, platelets: 100 })).toMatchObject({ fib4: 2.68, interpretation: 'high' });
  });
  it('ALT 0 (√0 → 0 나누기) → VALIDATION_ERROR (positive)', () => {
    expect(() => run('FIB4', { age: 60, ast: 40, alt: 0, platelets: 150 })).toThrow(CalcError);
  });
  it('혈소판 결측 → VALIDATION_ERROR', () => {
    expect(() => run('FIB4', { age: 60, ast: 40, alt: 40 })).toThrow(CalcError);
  });
});

describe('ASAP', () => {
  it('남 55세 AFP 20 PIVKA 40 → logit 0.3318, p 0.582', () => {
    expect(run('ASAP', { age: 55, sex: 'M', afp: 20, pivkaII: 40 })).toEqual({ probability: 0.582, percent: 58.2, logit: 0.3318 });
  });
  it('여성은 −0.576 만큼 logit 감소', () => {
    const m = run<{ logit: number }>('ASAP', { age: 55, sex: 'M', afp: 20, pivkaII: 40 }).logit;
    const f = run<{ logit: number }>('ASAP', { age: 55, sex: 'F', afp: 20, pivkaII: 40 }).logit;
    expect(m - f).toBeCloseTo(0.5761, 3);
  });
  it('확률은 항상 (0,1): 극단 입력', () => {
    expect(run<{ probability: number }>('ASAP', { age: 18, sex: 'F', afp: 0.1, pivkaII: 0.1 }).probability).toBeGreaterThanOrEqual(0);
    expect(run<{ probability: number }>('ASAP', { age: 100, sex: 'M', afp: 100000, pivkaII: 100000 }).probability).toBeLessThanOrEqual(1);
  });
  it('AFP 0 (ln 0) → VALIDATION_ERROR', () => {
    expect(() => run('ASAP', { age: 55, sex: 'M', afp: 0, pivkaII: 40 })).toThrow(CalcError);
  });
});
