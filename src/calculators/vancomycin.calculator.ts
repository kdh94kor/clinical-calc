import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { CalcError } from '../core/errors';
import { adultAgeYears, positive, sex } from '../core/schemas';
import { calculateVancomycin } from '../domain/vancomycin';

const isoTime = z.iso.datetime({ offset: true, local: true });

const sampleSchema = z.object({
  time: isoTime.describe('채혈 시각 (ISO 8601)'),
  concentration: positive('혈중 반코마이신 농도', 'mg/L (= µg/mL)', 15),
});

const levelsSchema = z
  .object({
    steadyState: z.boolean().default(true).describe('true=3회 이상 투여(항정상태), false=1회 투여'),
    doseMg: positive('최근 1회 투여 용량', 'mg', 1000),
    intervalHr: z.number().positive().optional().describe('투여 간격 [h] (항정상태면 필수)'),
    infusionHr: z.number().positive().default(1).describe('주입 시간 [h]'),
    doseStartTime: isoTime.describe('최근 투여 주입 시작 시각 (ISO 8601)'),
    samples: z.array(sampleSchema).min(1).max(2).describe('실측 농도 1건(Bayesian) 또는 2건(Sawchuk-Zaske)'),
  })
  .refine((v) => !v.steadyState || (v.intervalHr ?? 0) > 0, {
    path: ['intervalHr'],
    message: 'intervalHr is required when steadyState is true',
  });

const input = z.object({
  weightKg: positive('실제 체중', 'kg', 70),
  heightCm: positive('신장', 'cm', 175),
  sex,
  age: adultAgeYears.clone().meta({ example: 40 }),
  serumCreatinine: positive('혈청 크레아티닌 (IDMS 표준화)', 'mg/dL', 1.0),
  criticallyIll: z.boolean().default(false).describe('위중 환자 여부 (모집단 모델 선택에 사용)'),
  clearanceMethod: z.enum(['POPULATION', 'BAUER', 'MATZKE']).default('POPULATION').describe('청소율(CL) 추정 방법'),
  vdMethod: z
    .enum(['POPULATION', 'BAUER', 'MATZKE', 'RUSHING_AMBROSE', 'MORBIDLY_OBESE'])
    .default('POPULATION')
    .describe('분포용적(Vd) 추정 방법'),
  recommendLoadingDose: z.boolean().default(false).describe('부하용량(25 mg/kg TBW, 최대 3000 mg) 산출 여부'),
  mic: z.number().positive().default(1).describe('MIC [mg/L] (AUC/MIC 계산용)'),
  levels: levelsSchema.optional().describe('실측 약물농도가 있으면 환자 고유 PK로 추정'),
});

const compareRow = z.object({
  frequency: z.string(),
  intervalHr: z.number(),
  doseMg: z.number(),
  mgPerKg: z.number(),
  aucMic: z.number(),
  peak: z.number(),
  trough: z.number(),
  inRange: z.boolean().describe('AUC/MIC 400–600'),
  selected: z.boolean(),
});

const output = z.object({
  anthropometrics: z.object({
    tbwKg: z.number(),
    ibwKg: z.number().describe('Devine 이상체중 [kg]'),
    adjustedBwKg: z.number().nullable().describe('보정체중 (IBW + 0.4×(TBW−IBW)), 미적용 시 null'),
    bmi: z.number(),
    bsaM2: z.number().describe('Mosteller BSA [m²]'),
    dosingWeightKg: z.number().describe('Cockcroft-Gault에 쓰인 체중'),
  }),
  renal: z.object({
    crclMlMin: z.number().describe('CrCl (conventional SCr 보정, ClinCalc 표시값) [mL/min]'),
    crclIdmsMlMin: z.number().describe('CrCl (입력 IDMS SCr 그대로) [mL/min]'),
    apparentCrclMlMin: z.number().describe('Kel 역산 CrCl (Creighton) [mL/min]'),
  }),
  pk: z.object({
    clearanceModel: z.string(),
    vdModel: z.string(),
    clearanceLPerHr: z.number().describe('CL [L/h]'),
    vdL: z.number().describe('Vd [L]'),
    vdLPerKg: z.number(),
    kelPerHr: z.number().describe('제거속도상수 [h⁻¹]'),
    halfLifeHr: z.number().describe('반감기 [h]'),
  }),
  levelFit: z
    .object({
      measuredKelPerHr: z.number(),
      extrapolatedPeak: z.number().describe('현 용법의 예측/외삽 Peak [mg/L]'),
      extrapolatedTrough: z.number().describe('현 용법의 예측/외삽 Trough [mg/L]'),
      bayesSsInitial: z.number().optional(),
      bayesSsFinal: z.number().optional(),
    })
    .nullable(),
  recommendation: z.object({
    doseMg: z.number(),
    intervalHr: z.number(),
    infusionHr: z.number(),
    predictedPeak: z.number().describe('[mg/L]'),
    predictedTrough: z.number().describe('[mg/L]'),
    auc24: z.number().describe('AUC₀₋₂₄ [mg·h/L]'),
    aucMic: z.number(),
    loadingDoseMg: z.number().nullable(),
  }),
  compare: z.array(compareRow),
  warnings: z.array(z.string()),
});

const hoursBetween = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;

export default defineCalculator({
  code: 'VANCOMYCIN',
  name: 'Vancomycin AUC-guided Dosing',
  category: 'pharmacokinetics',
  summary:
    '1-컴파트먼트 모델로 CL/Vd를 추정(모집단 4모델 자동선택, 또는 실측 농도 1건 Bayesian / 2건 Sawchuk-Zaske)하고 AUC₀₋₂₄ 430–600 목표의 용량·간격을 권장. ClinCalc 표시값 재현 검증본',
  formula: [
    'IBW (Devine) = 50 (M) | 45.5 (F) + 2.3 × (height[in] − 60)',
    'AdjBW = IBW + 0.4 × (TBW − IBW)   if TBW > 1.3×IBW or BMI > 30',
    'CrCl (Cockcroft-Gault, dosing weight) = (140 − Age) × Wt / (72 × SCr) × 0.85 [F]; SCr_conv = SCr_IDMS × 1.065 + 0.067 for pre-2010 models',
    'Population CL: Buelga = CrCl × 0.0648 ; Roberts (critically ill) = 4.58 × (CrCl/1.73m² / 100) ; Masich (critically ill, obese) = 3.23 × (CrCl/40)^0.69 ; Adane (BMI>40, ≥120 kg) = 6.54 × (CrCl_TBW,1.73 / 125)',
    'Population Vd (L/kg TBW): Buelga 0.98, Roberts 1.53, Masich 0.78, Adane 0.51 ; Bauer 0.7 ; Matzke 0.72 (CrCl>60) / 0.89 ; Rushing-Ambrose 0.17×Age + 0.22×TBW + 15',
    'Kel = CL / Vd ; t½ = ln2 / Kel',
    'Peak_ss = Dose × (1 − e^(−Kel·tInf)) / (tInf × Vd × Kel × (1 − e^(−Kel·τ))) ; Trough_ss = Peak × e^(−Kel·(τ − tInf))',
    'AUC₀₋₂₄ = [ (Peak+Trough)/2 × tInf + (Peak−Trough)(τ−tInf)/ln(Peak/Trough) ] × 24/τ',
    'Sawchuk-Zaske (2 levels): Kel = ln(C1/C2)/(t2−t1) ; Vd = (Dose/tInf)(1−e^(−Kel·tInf)) / (Kel × (Cmax − Cmin·e^(−Kel·tInf)))',
    'Bayesian (1 level): minimise Σ(Cpred−Cobs)²/2 + (CL−CL₀)²/(2(CV_CL·CL₀)²) + (Vd−V₀)²/(2(CV_Vd·V₀)²)',
    'Recommendation: 15 mg/kg (250 mg 단위) 시작 → τ ∈ {8,12,24,36,48,72}에서 AUC₀₋₂₄ ≤ 600 첫 간격 → 용량을 AUC 430–600으로 조정. Loading 25 mg/kg (≤ 3000 mg)',
  ].join('\n'),
  references: [
    {
      title: 'Rybak MJ, et al. Therapeutic monitoring of vancomycin for serious MRSA infections: A revised consensus guideline (ASHP/IDSA/PIDS/SIDP). Am J Health-Syst Pharm 2020;77(11):835-864',
      url: 'https://doi.org/10.1093/ajhp/zxaa036',
    },
    { title: 'Buelga DS, et al. Population pharmacokinetic analysis of vancomycin in patients with hematological malignancies. Antimicrob Agents Chemother 2005;49(12):4934-41' },
    { title: 'Roberts JA, et al. Vancomycin dosing in critically ill patients: robust methods for improved continuous-infusion regimens. Antimicrob Agents Chemother 2011;55(6):2704-9' },
    { title: 'Masich AM, et al. Vancomycin pharmacokinetics in obese patients with sepsis or septic shock. Pharmacotherapy 2020;40(3):211-220' },
    { title: 'Adane ED, Herald M, Koura F. Pharmacokinetics of vancomycin in extremely obese patients with suspected or confirmed Staphylococcus aureus infections. Pharmacotherapy 2015;35(2):127-39' },
    { title: 'Bauer LA. Applied Clinical Pharmacokinetics, 3rd ed. McGraw-Hill 2014. Ch. 5 Vancomycin' },
    { title: 'Matzke GR, McGory RW, Halstenson CE, Keane WF. Pharmacokinetics of vancomycin in patients with various degrees of renal function. Antimicrob Agents Chemother 1984;25(4):433-7' },
    { title: 'Sawchuk RJ, Zaske DE. Pharmacokinetics of dosing regimens which utilize multiple intravenous infusions: gentamicin in burn patients. J Pharmacokinet Biopharm 1976;4(2):183-95' },
    { title: 'Devine BJ. Gentamicin therapy. Drug Intell Clin Pharm 1974;8:650-5 (IBW)' },
    { title: 'Mosteller RD. Simplified calculation of body-surface area. N Engl J Med 1987;317(17):1098' },
    { title: 'ClinCalc Vancomycin Calculator (표시값 패리티 검증 대상)', url: 'https://clincalc.com/Vancomycin/' },
  ],
  limitations: [
    '혈액투석(HD), 복막투석(PD), 지속적 신대체요법(CRRT/ECMO) 환자에게는 적용할 수 없습니다.',
    '소아·청소년(<18세), 임산부, 광범위 화상 환자 등 분포용적이나 청소율이 특이한 환자군에는 적용할 수 없습니다.',
    '신기능이 급변하는 급성 신손상(AKI) 환자에게는 정상상태(steady-state) 가정이 성립하지 않습니다.',
    '본 계산 결과는 초기 용량 설계를 위한 참고치이며, 투여 개시 후 반드시 TDM(혈중 농도 모니터링)으로 검증·조절해야 합니다.',
  ],
  legacySource: 'M.EMR.VancomycinCalculator/VancoCalcModel.vb (ClinCalc 패리티 검증본, 2026-09)',
  input,
  output,
  example: { weightKg: 70, heightCm: 175, sex: 'M', age: 40, serumCreatinine: 1.0 },
  compute: (v) => {
    const levels = v.levels
      ? {
          steadyState: v.levels.steadyState,
          doseMg: v.levels.doseMg,
          intervalHr: v.levels.intervalHr,
          infusionHr: v.levels.infusionHr,
          samples: v.levels.samples.map((s) => {
            const h = hoursBetween(v.levels!.doseStartTime, s.time);
            if (!(h > 0)) throw new CalcError('VALIDATION_ERROR', 'sample time must be after doseStartTime', 400);
            return { hoursAfterDoseStart: h, concentration: s.concentration };
          }),
        }
      : undefined;

    return calculateVancomycin({
      weightKg: v.weightKg,
      heightCm: v.heightCm,
      sex: v.sex,
      age: v.age,
      scr: v.serumCreatinine,
      criticallyIll: v.criticallyIll,
      clMethod: v.clearanceMethod,
      vdMethod: v.vdMethod,
      recommendLoading: v.recommendLoadingDose,
      mic: v.mic,
      levels,
    });
  },
});
