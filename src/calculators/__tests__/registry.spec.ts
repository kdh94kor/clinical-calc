import { z } from 'zod';
import { CalcError } from '../../core/errors';
import { CalculatorRegistry, registry } from '../../core/registry';
import { defineCalculator } from '../../core/calculator';

describe('CalculatorRegistry (plugin loader)', () => {
  const EXPECTED = [
    'ACR', 'AGRATIO', 'ANC', 'ANION_GAP', 'ASAP', 'BCRATIO', 'BMD_LUMBAR_AVERAGE', 'BMI', 'BSA',
    'CARF', 'CCR', 'CORRECTED_CALCIUM', 'CORRECTED_SODIUM', 'CRCL_URINE_24H', 'EGFR', 'FENA',
    'FIB4', 'GLOB', 'HOMA_IR', 'IDB', 'INSULIN_PEN_COUNT', 'LDL', 'NHDL', 'PCR',
    'PEDIATRIC_DOSE_FRACTION', 'TSAT', 'URINE_24H', 'VANCOMYCIN', 'WEIGHT_BASED_DOSE',
  ];

  it('auto-loads every *.calculator.ts in src/calculators', () => {
    expect(registry.list().map((d) => d.code)).toEqual(EXPECTED);
  });

  it.each(registry.list().map((d) => [d.code, d] as const))('%s has formula, references and a valid example', (_code, def) => {
    expect(def.formula.length).toBeGreaterThan(10);
    expect(def.references.length).toBeGreaterThan(0);
    expect(def.example).toBeDefined();
    expect(def.input.safeParse(def.example).success).toBe(true);
    // 예시로 실제 계산이 되고 출력 계약을 만족해야 한다
    expect(() => registry.run(def.code, def.example)).not.toThrow();
  });

  it.each(registry.list().map((d) => [d.code, d] as const))('%s input/output schemas convert to OpenAPI JSON Schema', (_c, def) => {
    expect(() => z.toJSONSchema(def.input, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' })).not.toThrow();
    expect(() => z.toJSONSchema(def.output, { target: 'openapi-3.0', unrepresentable: 'any' })).not.toThrow();
  });

  it('rejects duplicate codes and malformed codes', () => {
    const dup = new CalculatorRegistry();
    const def = registry.get('GLOB')!;
    dup.register(def);
    expect(() => dup.register(def)).toThrow(/Duplicate/);
    expect(() =>
      defineCalculator({
        code: 'bad-code',
        name: '',
        summary: '',
        category: 'chemistry',
        formula: '',
        references: [{ title: 'x' }],
        input: z.object({}),
        output: z.object({}),
        compute: () => ({}),
      }),
    ).toThrow(/UPPER_SNAKE/);
  });

  it('run(): unknown code → CALCULATOR_NOT_FOUND 404, code lookup is case-insensitive', () => {
    expect(() => registry.run('NOPE', {})).toThrow(CalcError);
    try {
      registry.run('NOPE', {});
    } catch (e) {
      expect((e as CalcError).code).toBe('CALCULATOR_NOT_FOUND');
      expect((e as CalcError).status).toBe(404);
    }
    expect(registry.get('glob')?.code).toBe('GLOB');
  });

  it('run(): invalid input → VALIDATION_ERROR with field paths', () => {
    try {
      registry.run('GLOB', { totalProtein: -1 });
      fail('should throw');
    } catch (e) {
      const err = e as CalcError;
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.status).toBe(400);
      const paths = (err.details as { path: string }[]).map((d) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['totalProtein', 'albumin']));
    }
  });

  it('run(): output contract violation is reported as INTERNAL_ERROR 500', () => {
    const reg = new CalculatorRegistry().register(
      defineCalculator({
        code: 'BROKEN',
        name: 'broken',
        summary: '',
        category: 'chemistry',
        formula: 'x = NaN',
        references: [{ title: 't' }],
        input: z.object({}),
        output: z.object({ x: z.number() }),
        compute: () => ({ x: 'oops' as unknown as number }),
      }),
    );
    try {
      reg.run('BROKEN', {});
      fail('should throw');
    } catch (e) {
      expect((e as CalcError).code).toBe('INTERNAL_ERROR');
      expect((e as CalcError).status).toBe(500);
    }
  });
});
