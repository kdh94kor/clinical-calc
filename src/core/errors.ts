export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'CALCULATOR_NOT_FOUND'
  | 'DIVISION_BY_ZERO'
  | 'COMPUTATION_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

/** 도메인/HTTP 공용 예외. status는 HTTP 매핑에만 쓰이고 계산 로직은 code만 본다. */
export class CalcError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CalcError';
  }
}
