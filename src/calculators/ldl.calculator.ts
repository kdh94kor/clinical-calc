import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

/** Friedewald 공식이 유효하지 않은 TG 상한 (mg/dL) */
export const FRIEDEWALD_TG_LIMIT = 400;

export default defineCalculator({
  code: 'LDL',
  name: 'LDL Cholesterol (Friedewald 계산치)',
  category: 'lipid',
  summary: 'Friedewald 공식으로 추정한 LDL-C. TG ≥ 400 mg/dL 또는 음수 결과는 계산 불가로 반환',
  formula: 'LDL-C [mg/dL] = TC − HDL-C − TG/5   (valid only when TG < 400 mg/dL)',
  references: [
    {
      title:
        'Friedewald WT, Levy RI, Fredrickson DS. Estimation of the concentration of low-density lipoprotein cholesterol in plasma, without use of the preparative ultracentrifuge. Clin Chem 1972;18(6):499-502',
      url: 'https://doi.org/10.1093/clinchem/18.6.499',
    },
  ],
  limitations: [
    '중성지방(TG) ≥ 400 mg/dL인 경우 VLDL-C = TG/5 가정이 성립하지 않아 계산할 수 없으며 직접측정법(Direct LDL-C)을 사용해야 합니다.',
    '제3형 이상지질단백혈증(Type III hyperlipoproteinemia) 환자에게는 적용할 수 없습니다.',
    '유미지립혈증(Chylomicronemia) 또는 비공복(Non-fasting) 검체의 경우 오차가 큽니다.',
    'LDL-C 수치가 70 mg/dL 미만인 매우 낮은 구간에서는 직접측정법 대비 과소평가 경향이 있습니다.',
  ],
  legacySource:
    'fmLabRstManager.vb › Lab_Result_Auto_Calc_Enter_Event_Common › Case "LDL" (UNRELIABLE_RESULT_LABEL 분기 → calculable=false 로 대체)',
  input: z.object({
    totalCholesterol: positive('총콜레스테롤', 'mg/dL', 200),
    hdl: positive('HDL 콜레스테롤', 'mg/dL', 50),
    triglyceride: positive('중성지방 (TG)', 'mg/dL', 150),
    precision: precision(0),
  }),
  output: z.object({
    ldl: z.number().nullable().describe('LDL-C [mg/dL], 계산 불가 시 null'),
    calculable: z.boolean(),
    reason: z.string().optional().describe('계산 불가 사유'),
  }),
  example: { totalCholesterol: 200, hdl: 50, triglyceride: 150 },
  compute: ({ totalCholesterol, hdl, triglyceride, precision }) => {
    if (triglyceride >= FRIEDEWALD_TG_LIMIT) {
      return { ldl: null, calculable: false, reason: `Friedewald not valid for TG ≥ ${FRIEDEWALD_TG_LIMIT} mg/dL` };
    }
    const ldl = D(totalCholesterol).minus(hdl).minus(D(triglyceride).div(5));
    if (ldl.isNegative()) return { ldl: null, calculable: false, reason: 'Computed LDL-C is negative' };
    return { ldl: fix(ldl, precision), calculable: true };
  },
});
