import type { Sex } from './anthropometry';

/**
 * Cockcroft-Gault 크레아티닌 청소율 (mL/min), 반올림 없음.
 * CrCl = (140 − age) × weight / (72 × SCr) × (0.85 if female)
 * Cockcroft DW, Gault MH. Nephron 1976;16(1):31-41.
 */
export function cockcroftGault(p: { age: number; weightKg: number; scrMgDl: number; sex: Sex }): number {
  const base = ((140 - p.age) * p.weightKg) / (72 * p.scrMgDl);
  return p.sex === 'F' ? base * 0.85 : base;
}

/** KDIGO 2012 GFR 카테고리 */
export function ckdStage(egfr: number): 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5' {
  if (egfr >= 90) return 'G1';
  if (egfr >= 60) return 'G2';
  if (egfr >= 45) return 'G3a';
  if (egfr >= 30) return 'G3b';
  if (egfr >= 15) return 'G4';
  return 'G5';
}
