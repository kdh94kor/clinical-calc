/**
 * M.OCS.MedCal 이식 계산기. 기대값은 fmMedCal.vb 공식을 손으로 계산한 값.
 */
import { CalcError } from '../../core/errors';
import { registry } from '../../core/registry';

const run = <T = Record<string, unknown>>(code: string, input: unknown) => registry.run(code, input) as T;
const expectValidation = (code: string, input: unknown) => {
  try {
    registry.run(code, input);
    throw new Error('expected CalcError');
  } catch (e) {
    expect(e).toBeInstanceOf(CalcError);
    expect((e as CalcError).code).toBe('VALIDATION_ERROR');
  }
};

describe('ANION_GAP', () => {
  it('140 − (104 + 24) = 12', () => expect(run('ANION_GAP', { sodium: 140, chloride: 104, bicarbonate: 24 })).toEqual({ anionGap: 12, includesPotassium: false }));
  it('K 포함: (140+4) − 128 = 16', () =>
    expect(run('ANION_GAP', { sodium: 140, chloride: 104, bicarbonate: 24, potassium: 4, includePotassium: true })).toEqual({ anionGap: 16, includesPotassium: true }));
  it('K 포함인데 potassium 결측 → VALIDATION_ERROR', () => expectValidation('ANION_GAP', { sodium: 140, chloride: 104, bicarbonate: 24, includePotassium: true }));
  it('음수 결과 허용(검사 오류 감지용)', () => expect(run<{ anionGap: number }>('ANION_GAP', { sodium: 120, chloride: 104, bicarbonate: 24 }).anionGap).toBe(-8));
});

describe('FENA', () => {
  it('100 × (1.2×20)/(140×80) = 0.21% → prerenal', () =>
    expect(run('FENA', { serumCreatinine: 1.2, urineSodium: 20, serumSodium: 140, urineCreatinine: 80 })).toEqual({ feNa: 0.21, interpretation: 'prerenal' }));
  it('경계: 정확히 1% → indeterminate, 2.01% → intrinsic', () => {
    // 100 × (1×40)/(140×x) = 1 → x = 28.5714 ; 사용 값으로 정확히 1.00 만들기: SCr 1, UNa 14, SNa 100, UCr 14 → 1.00
    expect(run('FENA', { serumCreatinine: 1, urineSodium: 14, serumSodium: 100, urineCreatinine: 14 })).toMatchObject({ feNa: 1, interpretation: 'indeterminate' });
    expect(run('FENA', { serumCreatinine: 2.01, urineSodium: 100, serumSodium: 100, urineCreatinine: 100 })).toMatchObject({ feNa: 2.01, interpretation: 'intrinsic' });
  });
  it('소변 Cr 0 → VALIDATION_ERROR', () => expectValidation('FENA', { serumCreatinine: 1, urineSodium: 14, serumSodium: 100, urineCreatinine: 0 }));
});

describe('CORRECTED_CALCIUM', () => {
  it('8.0 + 0.8×(4−2.5) = 9.2', () => expect(run('CORRECTED_CALCIUM', { totalCalcium: 8.0, albumin: 2.5 })).toEqual({ correctedCalcium: 9.2 }));
  it('알부민 4.0 → 보정 없음', () => expect(run('CORRECTED_CALCIUM', { totalCalcium: 9.1, albumin: 4.0 })).toEqual({ correctedCalcium: 9.1 }));
  it('고알부민(5.0) → 하향 보정 8.3', () => expect(run('CORRECTED_CALCIUM', { totalCalcium: 9.1, albumin: 5.0 })).toEqual({ correctedCalcium: 8.3 }));
});

describe('CORRECTED_SODIUM', () => {
  it('Katz 기본: 130 + 1.6×(600−100)/100 = 138', () =>
    expect(run('CORRECTED_SODIUM', { sodium: 130, glucose: 600 })).toEqual({ correctedSodium: 138, correctionApplied: 8, method: 'KATZ' }));
  it('Hillier: 130 + 2.4×5 = 142', () => expect(run('CORRECTED_SODIUM', { sodium: 130, glucose: 600, method: 'HILLIER' })).toMatchObject({ correctedSodium: 142 }));
  it('레거시 계수 1.0 재현: 130 + 5 = 135', () => expect(run('CORRECTED_SODIUM', { sodium: 130, glucose: 600, method: 'LEGACY_1_0' })).toMatchObject({ correctedSodium: 135 }));
  it('혈당 < 100 → 보정 0 (음의 보정 없음)', () => expect(run('CORRECTED_SODIUM', { sodium: 140, glucose: 70 })).toMatchObject({ correctedSodium: 140, correctionApplied: 0 }));
});

describe('BMI / BSA', () => {
  it('BMI 70/1.75² = 22.9 → normal(아시아-태평양 <23)', () => expect(run('BMI', { weightKg: 70, heightCm: 175 })).toEqual({ bmi: 22.9, category: 'normal' }));
  it('BMI 분류 경계: 18.4 under / 18.5 normal / 23.0 overweight / 25.0 obese_1 / 30.0 obese_2 / 35.0 obese_3 (신장 100cm → BMI=체중)', () => {
    const cat = (w: number) => run<{ category: string }>('BMI', { weightKg: w, heightCm: 100 }).category;
    expect([cat(18.4), cat(18.5), cat(23), cat(25), cat(30), cat(35)]).toEqual(['underweight', 'normal', 'overweight', 'obese_1', 'obese_2', 'obese_3']);
  });
  it('BSA Du Bois 175/70: 0.007184×175^0.725×70^0.425 = 1.85', () => expect(run('BSA', { weightKg: 70, heightCm: 175 })).toEqual({ bsa: 1.85, method: 'DU_BOIS' }));
  it('BSA Mosteller 175/70: √(12250/3600) = 1.84', () => expect(run('BSA', { weightKg: 70, heightCm: 175, method: 'MOSTELLER' })).toEqual({ bsa: 1.84, method: 'MOSTELLER' }));
});

describe('PEDIATRIC_DOSE_FRACTION', () => {
  it("Young 6세: 6/18 = 0.333, 성인 500 → 166.667", () =>
    expect(run('PEDIATRIC_DOSE_FRACTION', { rule: 'YOUNG', ageYears: 6, adultDose: 500 })).toEqual({ fraction: 0.333, pediatricDose: 166.667, rule: 'YOUNG' }));
  it("Clark 21 kg: 21/70 = 0.3, adultDose 없으면 null", () =>
    expect(run('PEDIATRIC_DOSE_FRACTION', { rule: 'CLARK', weightKg: 21 })).toEqual({ fraction: 0.3, pediatricDose: null, rule: 'CLARK' }));
  it('경계: Young 0세 → 0', () => expect(run<{ fraction: number }>('PEDIATRIC_DOSE_FRACTION', { rule: 'YOUNG', ageYears: 0 }).fraction).toBe(0));
  it('YOUNG인데 ageYears 결측 / CLARK인데 weightKg 결측 → VALIDATION_ERROR', () => {
    expectValidation('PEDIATRIC_DOSE_FRACTION', { rule: 'YOUNG', weightKg: 20 });
    expectValidation('PEDIATRIC_DOSE_FRACTION', { rule: 'CLARK', ageYears: 5 });
  });
});

describe('WEIGHT_BASED_DOSE', () => {
  it('70 kg × 15 mg/kg = 1050 mg', () => expect(run('WEIGHT_BASED_DOSE', { weightKg: 70, dosePerKg: 15 })).toEqual({ totalDose: 1050, unit: 'mg' }));
  it('mcg/kg → mcg, 3.3 kg × 0.1 = 0.33', () => expect(run('WEIGHT_BASED_DOSE', { weightKg: 3.3, dosePerKg: 0.1, doseUnit: 'mcg/kg' })).toEqual({ totalDose: 0.33, unit: 'mcg' }));
});

describe('INSULIN_PEN_COUNT', () => {
  it('40 IU × 30일 / 300 = 4 펜 (정확히 나누어짐)', () =>
    expect(run('INSULIN_PEN_COUNT', { dailyUnits: 40, days: 30, penType: 'U100_3ML' })).toEqual({ pens: 4, pensExact: 4, totalUnits: 1200, unitsPerPen: 300 }));
  it('U300: 40 × 30 / 450 = 2.67 → 3 펜', () =>
    expect(run('INSULIN_PEN_COUNT', { dailyUnits: 40, days: 30, penType: 'U300_3ML' })).toEqual({ pens: 3, pensExact: 2.67, totalUnits: 1200, unitsPerPen: 450 }));
  it('경계: 301 IU → 2 펜', () => expect(run<{ pens: number }>('INSULIN_PEN_COUNT', { dailyUnits: 301, days: 1, penType: 'U100_3ML' }).pens).toBe(2));
  it('days 소수 → VALIDATION_ERROR', () => expectValidation('INSULIN_PEN_COUNT', { dailyUnits: 40, days: 1.5, penType: 'U100_3ML' }));
});

describe('HOMA_IR', () => {
  it('100 × 10 / 405 = 2.47', () => expect(run('HOMA_IR', { fastingGlucose: 100, fastingInsulin: 10 })).toEqual({ homaIr: 2.47 }));
  it('인슐린 0 → VALIDATION_ERROR', () => expectValidation('HOMA_IR', { fastingGlucose: 100, fastingInsulin: 0 }));
});

describe('BMD_LUMBAR_AVERAGE', () => {
  it('4개 평균: (0.95+1.0+1.05+1.1)/4 = 1.025', () =>
    expect(run('BMD_LUMBAR_AVERAGE', { l1: 0.95, l2: 1.0, l3: 1.05, l4: 1.1 })).toEqual({ averageBmd: 1.025, vertebraeUsed: 4 }));
  it('L2 제외(3개): (0.95+1.05+1.1)/3 = 1.033', () =>
    expect(run('BMD_LUMBAR_AVERAGE', { l1: 0.95, l3: 1.05, l4: 1.1 })).toEqual({ averageBmd: 1.033, vertebraeUsed: 3 }));
  it('1개만 → 그 값', () => expect(run('BMD_LUMBAR_AVERAGE', { l3: 0.87 })).toEqual({ averageBmd: 0.87, vertebraeUsed: 1 }));
  it('전부 결측 → VALIDATION_ERROR', () => expectValidation('BMD_LUMBAR_AVERAGE', {}));
});
