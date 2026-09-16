/**
 * 반코마이신 PK. 기대값은 VancoCalcModel.vb(ClinCalc 패리티 검증본)의 반올림 체인을 손으로 따라간 값.
 */
import { CalcError } from '../../core/errors';
import { registry } from '../../core/registry';
import { calculateVancomycin, infusionHours, regimen, type VancoInput, type VancoResult } from '../../domain/vancomycin';
import { devineIbwKg } from '../../domain/anthropometry';

const base: VancoInput = {
  weightKg: 70,
  heightCm: 175,
  sex: 'M',
  age: 40,
  scr: 1.0,
  criticallyIll: false,
  clMethod: 'POPULATION',
  vdMethod: 'POPULATION',
  recommendLoading: false,
  mic: 1,
};

describe('anthropometrics', () => {
  it('Devine IBW (inch r1 체인): 175 cm 남 → 68.9 in → 70.5 kg, 160 cm 여 → 63.0 in → 52.4 kg', () => {
    expect(devineIbwKg(175, 'M')).toBe(70.5);
    expect(devineIbwKg(160, 'F')).toBe(52.4);
  });
  it('체중규칙: TBW<IBW → TBW, 1.3×IBW 초과 → AdjBW, 그 사이 → IBW', () => {
    // IBW 70.5
    expect(calculateVancomycin({ ...base, weightKg: 65 }).anthropometrics).toMatchObject({ dosingWeightKg: 65, adjustedBwKg: null });
    expect(calculateVancomycin({ ...base, weightKg: 80 }).anthropometrics).toMatchObject({ dosingWeightKg: 70.5, adjustedBwKg: null });
    // 100 kg: >1.3×70.5=91.65 → AdjBW = 70.5 + 0.4×29.5 = 82.3
    expect(calculateVancomycin({ ...base, weightKg: 100 }).anthropometrics).toMatchObject({ dosingWeightKg: 82.3, adjustedBwKg: 82.3 });
  });
});

describe('empiric (population) – 70 kg / 175 cm / M / 40 y / SCr 1.0', () => {
  let r: VancoResult;
  beforeAll(() => (r = calculateVancomycin(base)));

  it('CrCl: IDMS 97, conventional(SCr 1.13) 86', () => {
    // (140−40)×70/(72×1.0)=97.2→97 ; SCr 1.0×1.065+0.067=1.132→1.13 ; 7000/(72×1.13)=86.07→86
    expect(r.renal.crclIdmsMlMin).toBe(97);
    expect(r.renal.crclMlMin).toBe(86);
  });
  it('Buelga: CL = 86×0.06×1.08 = 5.57 L/h, Vd = 70×0.98 → 69 L, Kel 0.0807, t½ 8.6 h', () => {
    expect(r.pk.clearanceModel).toContain('Buelga');
    expect(r.pk.clearanceLPerHr).toBe(5.57);
    expect(r.pk.vdL).toBe(69);
    expect(r.pk.kelPerHr).toBe(0.0807);
    expect(r.pk.halfLifeHr).toBe(8.6);
  });
  it('권장 용법은 AUC24 430–600, 250 mg 단위, 주입시간 0.5 h 단위', () => {
    expect(r.recommendation.auc24).toBeGreaterThanOrEqual(430);
    expect(r.recommendation.auc24).toBeLessThanOrEqual(600);
    expect(r.recommendation.doseMg % 250).toBe(0);
    expect([8, 12, 24, 36, 48, 72]).toContain(r.recommendation.intervalHr);
    expect(r.recommendation.infusionHr).toBe(infusionHours(r.recommendation.doseMg));
    expect(r.recommendation.loadingDoseMg).toBeNull();
    expect(r.levelFit).toBeNull();
  });
  it('Compare 표: 선택 tau ≤ 24 → Q8/Q12/Q24 그룹, 선택 행 정확히 1개, InRange = 400–600', () => {
    expect(new Set(r.compare.map((c) => c.intervalHr))).toEqual(new Set([8, 12, 24]));
    expect(r.compare.filter((c) => c.selected)).toHaveLength(1);
    for (const row of r.compare) expect(row.inRange).toBe(row.aucMic >= 400 && row.aucMic <= 600);
  });
  it('부하용량 25 mg/kg → 1750 mg, 상한 3000 mg', () => {
    expect(calculateVancomycin({ ...base, recommendLoading: true }).recommendation.loadingDoseMg).toBe(1750);
    expect(calculateVancomycin({ ...base, weightKg: 150, heightCm: 190, recommendLoading: true }).recommendation.loadingDoseMg).toBe(3000);
  });
});

describe('population model selection', () => {
  it('위중 + BMI<30 → Roberts', () => expect(calculateVancomycin({ ...base, criticallyIll: true }).pk.clearanceModel).toContain('Roberts'));
  it('위중 + BMI≥30 + >100 kg → Masich', () =>
    expect(calculateVancomycin({ ...base, criticallyIll: true, weightKg: 110, heightCm: 175 }).pk.clearanceModel).toContain('Masich'));
  it('BMI>40 + ≥120 kg → Adane', () =>
    expect(calculateVancomycin({ ...base, weightKg: 130, heightCm: 170 }).pk.clearanceModel).toContain('Adane'));
  it('그 외 → Buelga', () => expect(calculateVancomycin(base).pk.clearanceModel).toContain('Buelga'));
  it('Bauer CL / Matzke Vd 조합', () => {
    const r = calculateVancomycin({ ...base, clMethod: 'BAUER', vdMethod: 'MATZKE' });
    // Bauer: (0.695×86/70+0.05)×70×0.06 = (0.8539+0.05)×4.2 = 3.7963 → 3.8
    expect(r.pk.clearanceLPerHr).toBe(3.8);
    // Matzke: CrCl 86 > 60 → 0.72×70 = 50.4 → 50
    expect(r.pk.vdL).toBe(50);
    expect(r.pk.vdModel).toBe('Matzke (0.72 L/kg)');
  });
  it('Rushing-Ambrose Vd = 0.17×40 + 0.22×70 + 15 = 37.2 → 37', () =>
    expect(calculateVancomycin({ ...base, vdMethod: 'RUSHING_AMBROSE' }).pk.vdL).toBe(37));
});

describe('regimen()', () => {
  it('Peak/Trough/AUC 반올림 체인과 정상상태 공식', () => {
    // kel 0.1, Vd 50 L, 1000 mg / 1 h / Q12
    const reg = regimen(1000, 1, 12, 50, 0.1);
    const peakExact = (1000 * (1 - Math.exp(-0.1))) / (1 * 50 * 0.1 * (1 - Math.exp(-1.2)));
    expect(reg.peak).toBe(Math.round(peakExact * 10) / 10);
    expect(reg.trough).toBe(Math.round(reg.peak * Math.exp(-0.1 * 11) * 10) / 10);
    expect(reg.auc24).toBeGreaterThan(0);
  });
  it('Trough가 0으로 반올림되는 극단(긴 간격·빠른 제거)에서도 AUC가 유한', () => {
    const reg = regimen(500, 0.5, 72, 40, 0.5);
    expect(reg.trough).toBe(0);
    expect(Number.isFinite(reg.auc24)).toBe(true);
  });
});

describe('drug levels – Sawchuk-Zaske (2 levels)', () => {
  it('알려진 kel/Vd로 합성한 농도 2건에서 kel·Vd를 복원한다', () => {
    const kel = 0.05;
    const vd = 50;
    const dose = 1000;
    const tInf = 1;
    const tau = 12;
    const cmax = (dose / tInf) * (1 - Math.exp(-kel * tInf)) / (kel * vd * (1 - Math.exp(-kel * tau)));
    const c = (t: number) => cmax * Math.exp(-kel * (t - tInf));
    const r = calculateVancomycin({
      ...base,
      levels: {
        steadyState: true,
        doseMg: dose,
        intervalHr: tau,
        infusionHr: tInf,
        samples: [
          { hoursAfterDoseStart: 2, concentration: c(2) },
          { hoursAfterDoseStart: 10, concentration: c(10) },
        ],
      },
    });
    expect(r.pk.clearanceModel).toContain('Sawchuk-Zaske');
    expect(r.levelFit?.measuredKelPerHr).toBe(0.05);
    expect(r.pk.vdL).toBe(50);
    expect(r.pk.clearanceLPerHr).toBe(2.5);
    expect(r.levelFit?.extrapolatedPeak).toBeCloseTo(cmax, 1);
    expect(r.levelFit?.extrapolatedTrough).toBeCloseTo(c(tau), 1);
  });
  it('샘플 순서가 뒤바뀌어도 정렬해서 처리', () => {
    const lv = { steadyState: true, doseMg: 1000, intervalHr: 12, infusionHr: 1 };
    const a = calculateVancomycin({ ...base, levels: { ...lv, samples: [{ hoursAfterDoseStart: 2, concentration: 30 }, { hoursAfterDoseStart: 10, concentration: 15 }] } });
    const b = calculateVancomycin({ ...base, levels: { ...lv, samples: [{ hoursAfterDoseStart: 10, concentration: 15 }, { hoursAfterDoseStart: 2, concentration: 30 }] } });
    expect(a.pk).toEqual(b.pk);
  });
  it('먼저 채혈한 농도가 더 낮으면 VALIDATION_ERROR', () => {
    expect(() =>
      calculateVancomycin({
        ...base,
        levels: { steadyState: true, doseMg: 1000, intervalHr: 12, infusionHr: 1, samples: [{ hoursAfterDoseStart: 2, concentration: 10 }, { hoursAfterDoseStart: 10, concentration: 15 }] },
      }),
    ).toThrow(CalcError);
  });
  it('항정상태인데 간격 결측 → VALIDATION_ERROR', () => {
    expect(() =>
      calculateVancomycin({ ...base, levels: { steadyState: true, doseMg: 1000, infusionHr: 1, samples: [{ hoursAfterDoseStart: 6, concentration: 15 }] } }),
    ).toThrow(CalcError);
  });
});

describe('drug levels – Bayesian (1 level)', () => {
  it('모집단 예측과 일치하는 농도를 주면 사후값 ≈ 사전값(Buelga CL 5.57 / Vd 69)', () => {
    const pop = calculateVancomycin(base);
    // 현재 용법 1000 mg Q12 1 h 에서 모집단 모델이 예측하는 6 h 농도를 관측값으로 넣는다
    const k = pop.pk.clearanceLPerHr / pop.pk.vdL;
    const rate = 1000 / 1 / (k * pop.pk.vdL);
    const accum = (1 - Math.exp(-10 * k * 12)) / (1 - Math.exp(-k * 12));
    const c6 = rate * (1 - Math.exp(-k * 1)) * accum * Math.exp(-k * 5);
    const r = calculateVancomycin({
      ...base,
      levels: { steadyState: true, doseMg: 1000, intervalHr: 12, infusionHr: 1, samples: [{ hoursAfterDoseStart: 6, concentration: c6 }] },
    });
    expect(r.pk.clearanceModel).toMatch(/Bayesian.*Buelga.*one drug level/);
    expect(r.pk.clearanceLPerHr).toBeCloseTo(pop.pk.clearanceLPerHr, 1);
    expect(r.pk.vdL).toBeCloseTo(pop.pk.vdL, 0);
    expect(r.levelFit?.bayesSsFinal).toBeLessThan(0.05);
    expect(r.warnings).toHaveLength(0);
  });
  it('관측 농도가 모집단 예측보다 훨씬 높으면 CL이 낮아지고 권장 용법은 여전히 AUC 430–600', () => {
    const pop = calculateVancomycin(base);
    const r = calculateVancomycin({
      ...base,
      levels: { steadyState: true, doseMg: 1000, intervalHr: 12, infusionHr: 1, samples: [{ hoursAfterDoseStart: 11, concentration: 45 }] },
    });
    expect(r.pk.clearanceLPerHr).toBeLessThan(pop.pk.clearanceLPerHr);
    expect(r.recommendation.auc24).toBeGreaterThanOrEqual(430);
    expect(r.recommendation.auc24).toBeLessThanOrEqual(600);
    expect(r.levelFit?.bayesSsFinal).toBeLessThan(r.levelFit?.bayesSsInitial ?? 0);
  });
  it('1회 투여(steadyState=false)는 간격 없이 계산된다', () => {
    const r = calculateVancomycin({
      ...base,
      levels: { steadyState: false, doseMg: 1500, infusionHr: 1.5, samples: [{ hoursAfterDoseStart: 8, concentration: 12 }] },
    });
    expect(r.pk.clearanceLPerHr).toBeGreaterThan(0);
    expect(r.levelFit?.extrapolatedTrough).toBe(0);
  });
});

describe('VANCOMYCIN calculator (HTTP DTO layer)', () => {
  it('ISO 시각을 경과시간으로 변환해 계산한다', () => {
    const out = registry.run('VANCOMYCIN', {
      weightKg: 70,
      heightCm: 175,
      sex: 'M',
      age: 40,
      serumCreatinine: 1.0,
      levels: {
        doseMg: 1000,
        intervalHr: 12,
        doseStartTime: '2026-09-16T08:00:00+09:00',
        samples: [
          { time: '2026-09-16T10:00:00+09:00', concentration: 30 },
          { time: '2026-09-16T18:00:00+09:00', concentration: 15 },
        ],
      },
    }) as VancoResult;
    expect(out.pk.clearanceModel).toContain('Sawchuk-Zaske');
    // ln(30/15)/8 = 0.0866
    expect(out.levelFit?.measuredKelPerHr).toBe(0.0866);
  });
  it('채혈 시각이 투여 시작 이전이면 VALIDATION_ERROR', () => {
    expect(() =>
      registry.run('VANCOMYCIN', {
        weightKg: 70, heightCm: 175, sex: 'M', age: 40, serumCreatinine: 1.0,
        levels: { doseMg: 1000, intervalHr: 12, doseStartTime: '2026-09-16T08:00:00Z', samples: [{ time: '2026-09-16T07:00:00Z', concentration: 30 }] },
      }),
    ).toThrow(CalcError);
  });
  it('샘플 3건 → VALIDATION_ERROR (최대 2건)', () => {
    expect(() =>
      registry.run('VANCOMYCIN', {
        weightKg: 70, heightCm: 175, sex: 'M', age: 40, serumCreatinine: 1.0,
        levels: {
          doseMg: 1000, intervalHr: 12, doseStartTime: '2026-09-16T08:00:00Z',
          samples: [
            { time: '2026-09-16T10:00:00Z', concentration: 30 },
            { time: '2026-09-16T12:00:00Z', concentration: 25 },
            { time: '2026-09-16T14:00:00Z', concentration: 20 },
          ],
        },
      }),
    ).toThrow(CalcError);
  });
});
