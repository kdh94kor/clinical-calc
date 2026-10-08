import type { ErrorCode } from '../core/errors';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: API_VERSION } = require('../../package.json') as { version: string };

/**
 * 모든 성공 응답에 실리는 고지문. 결과가 임상 판단을 대체하지 않음을 응답 자체에 남겨
 * 화면·로그 어디에 저장되더라도 고지가 함께 보존되게 한다.
 */
export const DISCLAIMER =
  '본 결과는 입력값에 대한 공식 계산치이며 임상 판단·처방을 대체하지 않습니다. ' +
  '최종 해석과 치료 결정은 면허를 가진 의료인이 환자 상태와 원시 검사값을 확인한 뒤 내려야 합니다. ' +
  'This output is a formula-based calculation for clinical decision support only and does not constitute medical advice.';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: { timestamp: string; apiVersion: string; disclaimer: string; calculator?: string };
}

export interface FailureEnvelope {
  success: false;
  error: { code: ErrorCode; message: string; details?: unknown };
}

export const ok = <T>(data: T, calculator?: string): SuccessEnvelope<T> => ({
  success: true,
  data,
  meta: {
    timestamp: new Date().toISOString(),
    apiVersion: API_VERSION,
    disclaimer: DISCLAIMER,
    ...(calculator ? { calculator } : {}),
  },
});

export const fail = (code: ErrorCode, message: string, details?: unknown): FailureEnvelope => ({
  success: false,
  error: { code, message, ...(details !== undefined ? { details } : {}) },
});
