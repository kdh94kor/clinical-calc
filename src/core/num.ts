import Decimal from 'decimal.js';
import { CalcError } from './errors';

// 표준 반올림 = HALF_UP(AwayFromZero). 레거시 VB Math.Round(Double)는 기본 ToEven(은행가)로
// 호출마다 달랐음 → 서비스 전체를 HALF_UP으로 단일화 (README 참고).
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const D = (v: Decimal.Value): Decimal => new Decimal(v);

/** 0 나누기는 계산 오류(422)로 던진다. 입력 스키마가 positive()면 여기 오지 않지만, 파생값(TP−ALB 등)을 위한 최후 방어선. */
export function div(numerator: Decimal.Value, denominator: Decimal.Value, what = 'denominator'): Decimal {
  const den = D(denominator);
  if (den.isZero()) throw new CalcError('DIVISION_BY_ZERO', `${what} must not be zero`, 422);
  return D(numerator).div(den);
}

export type RoundMode = 'round' | 'floor' | 'trunc';

/** 소수 places 자리로 정리해 number로 반환. */
export function fix(v: Decimal.Value, places: number, mode: RoundMode = 'round'): number {
  const rm =
    mode === 'round' ? Decimal.ROUND_HALF_UP : mode === 'floor' ? Decimal.ROUND_FLOOR : Decimal.ROUND_DOWN;
  return D(v).toDecimalPlaces(places, rm).toNumber();
}
