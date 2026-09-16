import type { ErrorCode } from '../core/errors';

export const API_VERSION = '1.0.0';

export const DISCLAIMER =
  '본 결과는 입력값에 대한 공식 계산치이며 임상 판단·처방을 대체하지 않습니다. ' +
  '최종 해석과 치료 결정은 면허를 가진 의료인이 환자 상태와 원시 검사값을 확인한 뒤 내려야 합니다. ' +
  'This output is a formula-based calculation for clinical decision support only and does not constitute medical advice.';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    apiVersion: string;
    timestamp: string;
    calculator?: string;
    disclaimer: string;
  };
}

export interface FailureEnvelope {
  success: false;
  error: { code: ErrorCode; message: string; details?: unknown };
}

export const ok = <T>(data: T, calculator?: string): SuccessEnvelope<T> => ({
  success: true,
  data,
  meta: {
    apiVersion: API_VERSION,
    timestamp: new Date().toISOString(),
    ...(calculator ? { calculator } : {}),
    disclaimer: DISCLAIMER,
  },
});

export const fail = (code: ErrorCode, message: string, details?: unknown): FailureEnvelope => ({
  success: false,
  error: { code, message, ...(details !== undefined ? { details } : {}) },
});

