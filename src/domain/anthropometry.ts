import { fix } from '../core/num';

export type Sex = 'M' | 'F';

/** Devine 이상체중. ClinCalc 표시 체인 재현: inch r1 → 결과 r1 */
export function devineIbwKg(heightCm: number, sex: Sex): number {
  const inchOver60 = fix(heightCm / 2.54, 1) - 60;
  return fix((sex === 'F' ? 45.5 : 50) + 2.3 * inchOver60, 1);
}

/** Mosteller BSA (m²) */
export function mostellerBsa(heightCm: number, weightKg: number): number {
  return Math.sqrt((heightCm * weightKg) / 3600);
}

export function bodyMassIndex(heightCm: number, weightKg: number): number {
  return weightKg / (heightCm / 100) ** 2;
}
