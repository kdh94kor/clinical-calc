/**
 * 단순 사칙연산 계산기 테이블 테스트: 정상값 / 경계값 / 결측·오류.
 * 기대값은 레거시 VB 공식을 손으로 계산한 값이다 (구현을 호출해 얻은 값이 아님).
 */
import { CalcError } from '../../core/errors';
import { registry } from '../../core/registry';

const run = <T = Record<string, unknown>>(code: string, input: unknown) => registry.run(code, input) as T;
const expectError = (code: string, input: unknown, errCode: CalcError['code']) => {
  try {
    registry.run(code, input);
    throw new Error('expected CalcError');
  } catch (e) {
    expect(e).toBeInstanceOf(CalcError);
    expect((e as CalcError).code).toBe(errCode);
  }
};

describe('GLOB', () => {
  it('7.2 − 4.3 = 2.9 (부동소수 오차 없이)', () => expect(run('GLOB', { totalProtein: 7.2, albumin: 4.3 })).toEqual({ globulin: 2.9 }));
  it('경계: 알부민 = 총단백 → 0', () => expect(run('GLOB', { totalProtein: 6, albumin: 6 })).toEqual({ globulin: 0 }));
  it('알부민 > 총단백 → VALIDATION_ERROR', () => expectError('GLOB', { totalProtein: 6, albumin: 6.1 }, 'VALIDATION_ERROR'));
  it('결측 → VALIDATION_ERROR', () => expectError('GLOB', { totalProtein: 6 }, 'VALIDATION_ERROR'));
});

describe('IDB', () => {
  it('1.2 − 0.3 = 0.9', () => expect(run('IDB', { totalBilirubin: 1.2, directBilirubin: 0.3 })).toEqual({ indirectBilirubin: 0.9 }));
  it('direct 0 허용', () => expect(run('IDB', { totalBilirubin: 0.8, directBilirubin: 0 })).toEqual({ indirectBilirubin: 0.8 }));
  it('direct > total → VALIDATION_ERROR', () => expectError('IDB', { totalBilirubin: 0.8, directBilirubin: 0.9 }, 'VALIDATION_ERROR'));
});

describe('AGRATIO', () => {
  it('4.3 / (7.2 − 4.3) = 1.48', () => expect(run('AGRATIO', { albumin: 4.3, totalProtein: 7.2 })).toEqual({ agRatio: 1.48 }));
  it('precision 1 → 1.5', () => expect(run('AGRATIO', { albumin: 4.3, totalProtein: 7.2, precision: 1 })).toEqual({ agRatio: 1.5 }));
  it('albumin = totalProtein (0 나누기) → 스키마에서 차단', () => expectError('AGRATIO', { albumin: 7, totalProtein: 7 }, 'VALIDATION_ERROR'));
});

describe('BCRATIO', () => {
  it('14 / 0.9 = 15.6', () => expect(run('BCRATIO', { bun: 14, creatinine: 0.9 })).toEqual({ bunCreatinineRatio: 15.6 }));
  it('creatinine 0 → VALIDATION_ERROR (positive)', () => expectError('BCRATIO', { bun: 14, creatinine: 0 }, 'VALIDATION_ERROR'));
});

describe('NHDL / CARF', () => {
  it('NHDL 200 − 50 = 150', () => expect(run('NHDL', { totalCholesterol: 200, hdl: 50 })).toEqual({ nonHdlCholesterol: 150 }));
  it('NHDL hdl > tc → VALIDATION_ERROR', () => expectError('NHDL', { totalCholesterol: 40, hdl: 50 }, 'VALIDATION_ERROR'));
  it('CARF 200 / 50 = 4', () => expect(run('CARF', { totalCholesterol: 200, hdl: 50 })).toEqual({ tcHdlRatio: 4 }));
  it('CARF 반올림 HALF_UP: 201/50 = 4.02, 205/60 = 3.42', () => {
    expect(run('CARF', { totalCholesterol: 201, hdl: 50 })).toEqual({ tcHdlRatio: 4.02 });
    expect(run('CARF', { totalCholesterol: 205, hdl: 60 })).toEqual({ tcHdlRatio: 3.42 });
  });
});

describe('LDL (Friedewald)', () => {
  it('200 − 50 − 150/5 = 120', () => expect(run('LDL', { totalCholesterol: 200, hdl: 50, triglyceride: 150 })).toEqual({ ldl: 120, calculable: true }));
  it('경계: TG 399.9 → 계산, TG 400 → 계산 불가', () => {
    expect(run('LDL', { totalCholesterol: 250, hdl: 40, triglyceride: 399.9 })).toMatchObject({ calculable: true, ldl: 130 });
    expect(run('LDL', { totalCholesterol: 250, hdl: 40, triglyceride: 400 })).toMatchObject({ calculable: false, ldl: null });
  });
  it('음수 결과 → 계산 불가', () => expect(run('LDL', { totalCholesterol: 100, hdl: 60, triglyceride: 300 })).toMatchObject({ calculable: false, ldl: null }));
});

describe('TSAT', () => {
  it('80 / 300 × 100 = 26.7', () => expect(run('TSAT', { iron: 80, tibc: 300 })).toEqual({ transferrinSaturation: 26.7 }));
  it('철 > TIBC 는 100% 초과 허용(분석적 상황)', () => expect(run('TSAT', { iron: 350, tibc: 300 })).toEqual({ transferrinSaturation: 116.7 }));
});

describe('ANC', () => {
  it('6.5 × 60% = 3.9 (10³/µL)', () => expect(run('ANC', { wbc: 6.5, neutrophilPercent: 60 })).toEqual({ anc: 3.9, unit: '10^3/uL' }));
  it('/µL 출력 = 3900', () => expect(run('ANC', { wbc: 6.5, neutrophilPercent: 60, outputUnit: '/uL', precision: 0 })).toEqual({ anc: 3900, unit: '/uL' }));
  it('경계: 0% → 0, 100% → WBC', () => {
    expect(run('ANC', { wbc: 6.5, neutrophilPercent: 0 })).toMatchObject({ anc: 0 });
    expect(run('ANC', { wbc: 6.5, neutrophilPercent: 100 })).toMatchObject({ anc: 6.5 });
  });
  it('101% → VALIDATION_ERROR', () => expectError('ANC', { wbc: 6.5, neutrophilPercent: 101 }, 'VALIDATION_ERROR'));
});

describe('PCR / ACR (기본 floor)', () => {
  it('PCR 30/120 × 1000 = 250', () => expect(run('PCR', { urineProtein: 30, urineCreatinine: 120 })).toEqual({ proteinCreatinineRatio: 250 }));
  it('PCR floor: 31/120×1000 = 258.33 → 258 (round 도 258), 35/120×1000 = 291.67 → floor 291 / round 292', () => {
    expect(run('PCR', { urineProtein: 35, urineCreatinine: 120 })).toEqual({ proteinCreatinineRatio: 291 });
    expect(run('PCR', { urineProtein: 35, urineCreatinine: 120, roundingMode: 'round' })).toEqual({ proteinCreatinineRatio: 292 });
  });
  it('ACR 25 mg/L / 120 mg/dL × 100 = 20.83 → 20, A1', () => expect(run('ACR', { urineMicroalbumin: 25, urineCreatinine: 120 })).toEqual({ albuminCreatinineRatio: 20, kdigoCategory: 'A1' }));
  it('ACR 카테고리 경계: 30 → A2, 300 → A2, 301 → A3', () => {
    expect(run('ACR', { urineMicroalbumin: 30, urineCreatinine: 100 })).toMatchObject({ albuminCreatinineRatio: 30, kdigoCategory: 'A2' });
    expect(run('ACR', { urineMicroalbumin: 300, urineCreatinine: 100 })).toMatchObject({ albuminCreatinineRatio: 300, kdigoCategory: 'A2' });
    expect(run('ACR', { urineMicroalbumin: 301, urineCreatinine: 100 })).toMatchObject({ albuminCreatinineRatio: 301, kdigoCategory: 'A3' });
  });
});

describe('URINE_24H', () => {
  it('Na 120 mmol/L × 1500 mL / 1000 = 180 mmol/day', () =>
    expect(run('URINE_24H', { concentration: 120, concentrationUnit: 'mmol/L', totalVolumeMl: 1500 })).toEqual({ amountPerDay: 180, unit: 'mmol/day' }));
  it('UCr 90 mg/dL × 1500 mL / 100 = 1350 mg/day', () =>
    expect(run('URINE_24H', { concentration: 90, concentrationUnit: 'mg/dL', totalVolumeMl: 1500 })).toEqual({ amountPerDay: 1350, unit: 'mg/day' }));
  it('Amylase U/L → U/day', () =>
    expect(run('URINE_24H', { concentration: 250, concentrationUnit: 'U/L', totalVolumeMl: 2000 })).toEqual({ amountPerDay: 500, unit: 'U/day' }));
  it('지원하지 않는 단위 → VALIDATION_ERROR', () => expectError('URINE_24H', { concentration: 1, concentrationUnit: 'oz', totalVolumeMl: 1 }, 'VALIDATION_ERROR'));
});

describe('CRCL_URINE_24H', () => {
  it('90/1.0 × 1500/1440 = 93.75 → 94', () =>
    expect(run('CRCL_URINE_24H', { urineCreatinine: 90, serumCreatinine: 1.0, totalVolumeMl: 1500 })).toEqual({ creatinineClearance: 94 }));
  it('12시간 채집(720분) → 2배', () =>
    expect(run('CRCL_URINE_24H', { urineCreatinine: 90, serumCreatinine: 1.0, totalVolumeMl: 1500, collectionMinutes: 720, precision: 1 })).toEqual({ creatinineClearance: 187.5 }));
});

describe('CCR (Cockcroft-Gault)', () => {
  it('65세 남 70 kg SCr 1.0 → 72.9', () => expect(run('CCR', { age: 65, sex: 'M', weightKg: 70, serumCreatinine: 1.0 })).toEqual({ creatinineClearance: 72.9 }));
  it('여성 ×0.85 → 62.0', () => expect(run('CCR', { age: 65, sex: 'F', weightKg: 70, serumCreatinine: 1.0 })).toEqual({ creatinineClearance: 62 }));
  it('나이 140 이상 → VALIDATION_ERROR (음수 CrCl 방지)', () => expectError('CCR', { age: 140, sex: 'M', weightKg: 70, serumCreatinine: 1.0 }, 'VALIDATION_ERROR'));
  it('성별 코드 오류 → VALIDATION_ERROR', () => expectError('CCR', { age: 65, sex: 'X', weightKg: 70, serumCreatinine: 1.0 }, 'VALIDATION_ERROR'));
});
