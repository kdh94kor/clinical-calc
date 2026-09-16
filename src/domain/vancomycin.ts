/*
 * 반코마이신 약동학 모델 — M.EMR.VancomycinCalculator/VancoCalcModel.vb 이식.
 * ClinCalc(https://clincalc.com/Vancomycin/) 표시값과 자릿수 단위로 일치하도록 검증된 반올림 체인을 그대로 유지한다.
 *
 * 수치 방식: 지수·로그·반복 최적화가 핵심이라 계산은 IEEE double로 수행하고, 표시 자릿수 정리(fix)만 Decimal로 한다.
 * (Decimal로 exp/ln을 돌리면 정확도 이득 없이 수십 배 느려진다.)
 */
import { CalcError } from '../core/errors';
import { fix } from '../core/num';
import { bodyMassIndex, devineIbwKg, mostellerBsa, type Sex } from './anthropometry';
import { cockcroftGault } from './renal';

export type ClMethod = 'POPULATION' | 'BAUER' | 'MATZKE';
export type VdMethod = 'POPULATION' | 'BAUER' | 'MATZKE' | 'RUSHING_AMBROSE' | 'MORBIDLY_OBESE';

export interface LevelSample {
  /** 최근 투여(주입 시작) 기준 경과 시간 [h] */
  hoursAfterDoseStart: number;
  /** 혈중 농도 [mg/L] */
  concentration: number;
}

export interface VancoLevels {
  steadyState: boolean;
  doseMg: number;
  intervalHr?: number;
  infusionHr: number;
  samples: LevelSample[];
}

export interface VancoInput {
  weightKg: number;
  heightCm: number;
  sex: Sex;
  age: number;
  /** IDMS 표준화 SCr [mg/dL] */
  scr: number;
  criticallyIll: boolean;
  clMethod: ClMethod;
  vdMethod: VdMethod;
  recommendLoading: boolean;
  mic: number;
  levels?: VancoLevels;
}

export interface Regimen {
  peak: number;
  trough: number;
  auc24: number;
}

export interface CompareRow {
  frequency: string;
  intervalHr: number;
  doseMg: number;
  mgPerKg: number;
  aucMic: number;
  peak: number;
  trough: number;
  inRange: boolean;
  selected: boolean;
}

export interface VancoResult {
  anthropometrics: { tbwKg: number; ibwKg: number; adjustedBwKg: number | null; bmi: number; bsaM2: number; dosingWeightKg: number };
  renal: { crclMlMin: number; crclIdmsMlMin: number; apparentCrclMlMin: number };
  pk: {
    clearanceModel: string;
    vdModel: string;
    clearanceLPerHr: number;
    vdL: number;
    vdLPerKg: number;
    kelPerHr: number;
    halfLifeHr: number;
  };
  levelFit: null | {
    measuredKelPerHr: number;
    extrapolatedPeak: number;
    extrapolatedTrough: number;
    bayesSsInitial?: number;
    bayesSsFinal?: number;
  };
  recommendation: {
    doseMg: number;
    intervalHr: number;
    infusionHr: number;
    predictedPeak: number;
    predictedTrough: number;
    auc24: number;
    aucMic: number;
    loadingDoseMg: number | null;
  };
  compare: CompareRow[];
  warnings: string[];
}

const r = (v: number, places = 0) => fix(v, places);
const TAU_LIST = [8, 12, 24, 36, 48, 72] as const;

interface Ctx {
  p: VancoInput;
  ibw: number;
  bmi: number;
  bsa: number;
  /** IDMS→conventional 보정 SCr 기반 CrCl (2010년 이전 발표식용) */
  crclConv: number;
  /** 입력 SCr 그대로의 CrCl */
  crclRaw: number;
}

interface PkEstimate {
  modelName: string;
  vdMethodName: string;
  cl: number;
  clExact: number;
  vdL: number;
  measuredKel: number;
  kelExact: number;
  extrapPeak?: number;
  extrapTrough?: number;
  bayesSsInitial?: number;
  bayesSsFinal?: number;
  warning?: string;
}

/* ───────────── 용법 계산 (ClinCalc 반올림 체인) ───────────── */

/** 주입시간 = 1000 mg/hr, 0.5 h 단위 올림 */
export function infusionHours(doseMg: number): number {
  return Math.ceil(doseMg / 1000 / 0.5) * 0.5;
}

/** 한 용법의 Peak(r1)/Trough(r1)/AUC24(정수). Trough는 반올림 Peak 기준, AUC는 반올림 Peak/Trough로 사다리꼴 */
export function regimen(doseMg: number, tInfHr: number, tauHr: number, vdL: number, kel: number): Regimen {
  const peakExact = (doseMg * (1 - Math.exp(-kel * tInfHr))) / (tInfHr * vdL * kel * (1 - Math.exp(-kel * tauHr)));
  const peak = r(peakExact, 1);
  const troughExact = peak * Math.exp(-kel * (tauHr - tInfHr));
  const trough = r(troughExact, 1);
  // 반올림 trough가 0이면 ln(peak/0)로 발산 → 비반올림 값으로 대체 (VB 원본의 미해결 결함 보정)
  const tr = trough > 0 ? trough : Math.max(troughExact, 1e-9);
  const linTrap = ((tr + peak) / 2) * tInfHr;
  const logTrap = ((peak - tr) * (tauHr - tInfHr)) / Math.log(peak / tr);
  return { peak, trough, auc24: r((linTrap + logTrap) * (24 / tauHr)) };
}

function initialDose(tbwKg: number, minMg: number): number {
  return Math.max(minMg, Math.min(r((tbwKg * 15) / 250) * 250, 2000));
}

/** 권장 간격: 15 mg/kg(250 반올림) 용량으로 Q8→Q72 순회, AUC24 ≤ 600이 되는 첫 간격 */
export function selectInterval(kel: number, vdL: number, tbwKg: number): number {
  const dose = initialDose(tbwKg, 500);
  for (const tau of TAU_LIST) {
    if (regimen(dose, infusionHours(dose), tau, vdL, kel).auc24 <= 600) return tau;
  }
  return TAU_LIST[TAU_LIST.length - 1] as number;
}

/** 권장 용량: 15 mg/kg 시작, AUC24 > 600 → −250 / < 430 → +250 (250–2000 mg). 하한 430은 ClinCalc 실측 역산값 */
export function recommendDose(kel: number, vdL: number, tbwKg: number, tauHr: number) {
  let dose = initialDose(tbwKg, 250);
  for (let i = 0; i < 20; i++) {
    const tInf = infusionHours(dose);
    const reg = regimen(dose, tInf, tauHr, vdL, kel);
    if (reg.auc24 > 600 && dose > 250) dose -= 250;
    else if (reg.auc24 < 430 && dose < 2000) dose += 250;
    else return { doseMg: dose, infusionHr: tInf, auc24: reg.auc24 };
  }
  const tInf = infusionHours(dose);
  return { doseMg: dose, infusionHr: tInf, auc24: regimen(dose, tInf, tauHr, vdL, kel).auc24 };
}

/**
 * Compare Dosing Options. 그룹: 선택 tau ≤ 24 → Q8/Q12/Q24, 초과 → Q24/Q36/Q48.
 * ponytail: 그룹 창·하한 규칙은 ClinCalc 실측 역산 근사(±1행 편차 가능). 사이트 규칙이 확정되면 여기만 고친다.
 */
export function compareOptions(vdL: number, kel: number, selTau: number, selDose: number, tbwKg: number, mic: number): CompareRow[] {
  const taus = selTau <= 24 ? [8, 12, 24] : [24, 36, 48];
  const capMgKg = [19, 23, 27];
  const rows: CompareRow[] = [];
  taus.forEach((tau, idx) => {
    const selGroup = tau === selTau;
    for (let dose = 500; dose <= 2000; dose += 250) {
      const mgKg = dose / tbwKg;
      if (mgKg > (capMgKg[idx] as number)) break;
      if (r(mgKg) < 8) continue;
      const reg = regimen(dose, infusionHours(dose), tau, vdL, kel);
      if (reg.auc24 < (selGroup ? 285 : 200)) continue;
      if (idx === 1 && !selGroup && reg.auc24 > 900) break;
      const aucMic = r(reg.auc24 / mic);
      rows.push({
        frequency: `Q${tau}hr`,
        intervalHr: tau,
        doseMg: dose,
        mgPerKg: r(mgKg),
        aucMic,
        peak: reg.peak,
        trough: reg.trough,
        inRange: aucMic >= 400 && aucMic <= 600,
        selected: selGroup && dose === selDose,
      });
    }
  });
  return rows;
}

/* ───────────── CL / Vd 추정 ───────────── */

function populationModel(c: Ctx): { name: string; clExact: number; vdFactor: number } {
  const { p, bmi, bsa, crclRaw, crclConv } = c;
  if (p.criticallyIll && bmi >= 30 && p.weightKg > 100) {
    return { name: 'Masich 2020', clExact: 3.23 * Math.pow(crclRaw / 40, 0.69), vdFactor: 0.78 };
  }
  if (p.criticallyIll && bmi < 30) {
    const per173 = bsa > 0 ? crclRaw * (1.73 / bsa) : crclRaw;
    return { name: 'Roberts 2011', clExact: 4.58 * (per173 / 100), vdFactor: 1.53 };
  }
  if (bmi > 40 && p.weightKg >= 120) {
    let crclTbw = r(cockcroftGault({ age: p.age, weightKg: p.weightKg, scrMgDl: p.scr, sex: p.sex }));
    if (bsa > 0) crclTbw = (crclTbw / bsa) * 1.73;
    return { name: 'Adane 2015', clExact: 6.54 * (crclTbw / 125), vdFactor: 0.51 };
  }
  return { name: 'Buelga 2005', clExact: crclConv * (60 / 1000) * 1.08, vdFactor: 0.98 };
}

const popLabel = (name: string) => `Population estimates from PK modeling (${name})`;

function resolveVd(c: Ctx): { vdL: number; vdMethodName: string } {
  const { p, crclConv } = c;
  switch (p.vdMethod) {
    case 'BAUER':
      return { vdL: r(p.weightKg * 0.7), vdMethodName: 'Bauer (0.7 L/kg)' };
    case 'MATZKE': {
      const f = crclConv > 60 ? 0.72 : 0.89;
      return { vdL: r(p.weightKg * f), vdMethodName: `Matzke (${f} L/kg)` };
    }
    case 'RUSHING_AMBROSE':
      return { vdL: r(0.17 * p.age + 0.22 * p.weightKg + 15), vdMethodName: 'Rushing-Ambrose' };
    case 'MORBIDLY_OBESE':
      return { vdL: r(p.weightKg * 0.52), vdMethodName: 'Morbidly obese (0.52 L/kg)' };
    default: {
      const m = populationModel(c);
      return { vdL: r(p.weightKg * m.vdFactor), vdMethodName: popLabel(m.name) };
    }
  }
}

function resolvePopulation(c: Ctx): PkEstimate {
  const { p, crclConv } = c;
  let modelName: string;
  let cl: number;
  let clExact = 0;
  let vd: { vdL: number; vdMethodName: string } | null = null;

  switch (p.clMethod) {
    case 'BAUER':
      modelName = 'Bauer';
      cl = r((0.695 * (crclConv / p.weightKg) + 0.05) * p.weightKg * 0.06, 2);
      break;
    case 'MATZKE':
      modelName = 'Matzke';
      cl = r((0.689 * crclConv + 3.66) * 0.06, 2);
      break;
    default: {
      const m = populationModel(c);
      modelName = popLabel(m.name);
      clExact = m.clExact;
      cl = r(clExact, 2);
      if (p.vdMethod === 'POPULATION') vd = { vdL: r(p.weightKg * m.vdFactor), vdMethodName: modelName };
    }
  }
  vd ??= resolveVd(c);
  return { modelName, vdMethodName: vd.vdMethodName, cl, clExact, vdL: vd.vdL, measuredKel: 0, kelExact: 0 };
}

const bad = (msg: string) => new CalcError('VALIDATION_ERROR', msg, 400);

function resolveByLevels(c: Ctx): PkEstimate {
  const { p } = c;
  const L = p.levels as VancoLevels;
  const tInf = L.infusionHr > 0 ? L.infusionHr : 1;
  const tau = L.intervalHr ?? 0;
  if (L.steadyState && tau <= 0) throw bad('levels.intervalHr is required when steadyState is true');

  const samples = [...L.samples].sort((a, b) => a.hoursAfterDoseStart - b.hoursAfterDoseStart);
  if (samples.some((s) => s.hoursAfterDoseStart <= 0)) throw bad('sample time must be after dose start time');

  /* 2레벨: Sawchuk-Zaske */
  if (samples.length === 2) {
    const [s1, s2] = samples as [LevelSample, LevelSample];
    const t1 = s1.hoursAfterDoseStart;
    const t2 = s2.hoursAfterDoseStart;
    const c1 = s1.concentration;
    const c2 = s2.concentration;
    if (t2 - t1 <= 0) throw bad('the two sample times must differ');
    if (c1 <= c2) throw bad('earlier sample must have the higher concentration (both samples must be in the elimination phase)');
    const kel = Math.log(c1 / c2) / (t2 - t1);
    const cMax = c1 * Math.exp(kel * Math.max(t1 - tInf, 0));
    const cMin = L.steadyState ? c2 * Math.exp(-kel * Math.max(tau - t2, 0)) : 0;
    const vd = ((L.doseMg / tInf) * (1 - Math.exp(-kel * tInf))) / (kel * (cMax - cMin * Math.exp(-kel * tInf)));
    const name = 'Two drug levels (Sawchuk-Zaske)';
    return {
      modelName: name,
      vdMethodName: name,
      vdL: r(vd, 1),
      measuredKel: r(kel, 4),
      cl: r(kel * vd, 2),
      clExact: kel * vd,
      kelExact: r(kel, 4),
      extrapPeak: r(cMax, 2),
      extrapTrough: r(cMin, 2),
    };
  }

  /* 1레벨: Bayesian (모집단 사전분포 + 실측 1건). ClinCalc 15케이스 재현 검증본 */
  const pop = resolvePopulation(c);
  const cl0 = pop.clExact > 0 ? pop.clExact : pop.cl;
  let v0 = pop.vdL;
  let cvCl = 0.28;
  let cvVd = 0.37; // Buelga 기본
  const m = pop.modelName;
  if (m.includes('Roberts')) [v0, cvCl, cvVd] = [p.weightKg * 1.53, 0.39, 0.37];
  else if (m.includes('Masich')) [v0, cvCl, cvVd] = [p.weightKg * 0.78, 0.31, 0.12];
  else if (m.includes('Adane')) [v0, cvCl, cvVd] = [p.weightKg * 0.51, 0.27, 0.24];
  else if (m.includes('Buelga')) v0 = p.weightKg * 0.98;

  // 농도 모델: 항정상태 = 10회 투여 중첩, 1회 투여 = 단회
  const predict = (cl: number, vd: number, t: number): number => {
    const k = cl / vd;
    const rate = L.doseMg / tInf / (k * vd);
    const accum = L.steadyState ? (1 - Math.exp(-10 * k * tau)) / (1 - Math.exp(-k * tau)) : 1;
    if (t >= tInf) return rate * (1 - Math.exp(-k * tInf)) * accum * Math.exp(-k * (t - tInf));
    const cPrev = L.steadyState ? rate * (1 - Math.exp(-k * tInf)) * accum * Math.exp(-k * (tau - tInf)) : 0;
    return rate * (1 - Math.exp(-k * t)) + cPrev * Math.exp(-k * t);
  };
  const objective = (cl: number, vd: number): number => {
    if (cl <= 0.05 || vd <= 5) return Number.MAX_VALUE;
    let j = 0;
    for (const s of samples) j += (predict(cl, vd, s.hoursAfterDoseStart) - s.concentration) ** 2 / 2;
    j += (cl - cl0) ** 2 / (2 * (cvCl * cl0) ** 2);
    j += (vd - v0) ** 2 / (2 * (cvVd * v0) ** 2);
    return j;
  };

  // 좌표하강 + 스텝 반감 (결정적)
  let xCl = cl0;
  let xVd = v0;
  let stepCl = cl0 * 0.15;
  let stepVd = v0 * 0.1;
  let best = objective(xCl, xVd);
  const jInit = best;
  while (stepCl > 1e-7) {
    let improved = false;
    for (const [dc, dv] of [[stepCl, 0], [-stepCl, 0], [0, stepVd], [0, -stepVd]] as const) {
      const j = objective(xCl + dc, xVd + dv);
      if (j < best) {
        best = j;
        xCl += dc;
        xVd += dv;
        improved = true;
      }
    }
    if (!improved) {
      stepCl /= 2;
      stepVd /= 2;
    }
  }

  const cl = r(xCl, 2);
  const vdL = r(xVd, 1);
  const shortModel = m.replace('Population estimates from PK modeling ', '');
  return {
    modelName: `Bayesian modeling ${shortModel} [one drug level]`,
    vdMethodName: `Bayesian modeling ${shortModel} [one drug level]`,
    cl,
    clExact: xCl,
    vdL,
    measuredKel: r(cl / vdL, 4),
    kelExact: cl / vdL,
    extrapPeak: r(predict(xCl, xVd, tInf), 2),
    extrapTrough: L.steadyState ? r(predict(xCl, xVd, tau), 2) : 0,
    bayesSsInitial: r(jInit, 2),
    bayesSsFinal: r(best, 2),
    warning:
      best > 5
        ? `Bayesian fit is poor (residual sum of squares ${r(best, 2)}). Check dose, sample times and concentrations.`
        : undefined,
  };
}

/* ───────────── 진입점 ───────────── */

export function calculateVancomycin(p: VancoInput): VancoResult {
  const ibw = devineIbwKg(p.heightCm, p.sex);
  const bmi = r(bodyMassIndex(p.heightCm, p.weightKg), 1);
  const bsa = r(mostellerBsa(p.heightCm, p.weightKg), 2);
  // ClinCalc 체중규칙: TBW<IBW → TBW / (TBW>1.3×IBW 또는 BMI>30) → AdjBW(0.4) / 그 외 IBW
  const adjBw = p.weightKg >= ibw && (p.weightKg > ibw * 1.3 || bmi > 30) ? r(ibw + 0.4 * (p.weightKg - ibw), 1) : 0;
  const dosingWeight = p.weightKg < ibw ? p.weightKg : adjBw > 0 ? adjBw : ibw;

  const crclOf = (scr: number) => r(cockcroftGault({ age: p.age, weightKg: dosingWeight, scrMgDl: scr, sex: p.sex }));
  // 입력 SCr = IDMS 간주. 2010년 이전 발표식(Buelga/Bauer/Matzke)은 conventional(×1.065+0.067)로 보정
  const crclConv = crclOf(r(p.scr * 1.065 + 0.067, 2));
  const crclRaw = crclOf(p.scr);

  const ctx: Ctx = { p, ibw, bmi, bsa, crclConv, crclRaw };
  const pk = p.levels ? resolveByLevels(ctx) : resolvePopulation(ctx);
  if (pk.cl <= 0 || pk.vdL <= 0) throw new CalcError('COMPUTATION_ERROR', 'CL/Vd estimation failed for the given inputs', 422);

  const kel = pk.measuredKel > 0 ? pk.measuredKel : r(pk.cl / pk.vdL, 4);
  const kelExact = pk.kelExact > 0 ? pk.kelExact : kel;
  const mic = p.mic > 0 ? p.mic : 1;

  const tau = selectInterval(kelExact, pk.vdL, p.weightKg);
  const rec = recommendDose(kelExact, pk.vdL, p.weightKg, tau);
  const reg = regimen(rec.doseMg, rec.infusionHr, tau, pk.vdL, kel);

  const warnings: string[] = [];
  if (pk.warning) warnings.push(pk.warning);

  return {
    anthropometrics: { tbwKg: p.weightKg, ibwKg: ibw, adjustedBwKg: adjBw > 0 ? adjBw : null, bmi, bsaM2: bsa, dosingWeightKg: dosingWeight },
    renal: { crclMlMin: crclConv, crclIdmsMlMin: crclRaw, apparentCrclMlMin: r((kel - 0.0044) / 0.00083) },
    pk: {
      clearanceModel: pk.modelName,
      vdModel: pk.vdMethodName,
      clearanceLPerHr: pk.cl,
      vdL: pk.vdL,
      vdLPerKg: r(pk.vdL / p.weightKg, 2),
      kelPerHr: kel,
      halfLifeHr: r(Math.LN2 / kel, 1),
    },
    levelFit: p.levels
      ? {
          measuredKelPerHr: pk.measuredKel,
          extrapolatedPeak: pk.extrapPeak ?? 0,
          extrapolatedTrough: pk.extrapTrough ?? 0,
          ...(pk.bayesSsInitial !== undefined ? { bayesSsInitial: pk.bayesSsInitial, bayesSsFinal: pk.bayesSsFinal } : {}),
        }
      : null,
    recommendation: {
      doseMg: rec.doseMg,
      intervalHr: tau,
      infusionHr: rec.infusionHr,
      predictedPeak: reg.peak,
      predictedTrough: reg.trough,
      auc24: reg.auc24,
      aucMic: r(reg.auc24 / mic),
      loadingDoseMg: p.recommendLoading ? Math.min(r((p.weightKg * 25) / 250) * 250, 3000) : null,
    },
    compare: compareOptions(pk.vdL, kelExact, tau, rec.doseMg, p.weightKg, mic),
    warnings,
  };
}
