import fs from 'node:fs';
import path from 'node:path';
import type { CalculatorDefinition } from './calculator';
import { CalcError } from './errors';

function isDefinition(v: unknown): v is CalculatorDefinition {
  return typeof v === 'object' && v !== null && 'code' in v && 'compute' in v && 'input' in v;
}

export class CalculatorRegistry {
  private readonly items = new Map<string, CalculatorDefinition>();

  register(def: CalculatorDefinition): this {
    if (this.items.has(def.code)) throw new Error(`Duplicate calculator code: ${def.code}`);
    this.items.set(def.code, def);
    return this;
  }

  get(code: string): CalculatorDefinition | undefined {
    return this.items.get(code.toUpperCase());
  }

  list(): CalculatorDefinition[] {
    return [...this.items.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  /** 입력 검증 → 계산 → 출력 계약 검증. 컨트롤러는 이것만 호출한다. */
  run(code: string, rawInput: unknown): unknown {
    const def = this.get(code);
    if (!def) throw new CalcError('CALCULATOR_NOT_FOUND', `Unknown calculator: ${code}`, 404);

    const parsed = def.input.safeParse(rawInput);
    if (!parsed.success) {
      throw new CalcError(
        'VALIDATION_ERROR',
        'Invalid input',
        400,
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const result = def.compute(parsed.data);
    const out = def.output.safeParse(result);
    if (!out.success) {
      // 계산기가 자기 출력 계약을 어긴 것 = 서버 버그
      throw new CalcError('INTERNAL_ERROR', `Calculator ${def.code} produced invalid output`, 500, out.error.issues);
    }
    return out.data;
  }

  /** 디렉터리의 *.calculator.(ts|js) 를 전부 require 해서 등록 (플러그인 로더) */
  static loadFromDirectory(dir: string): CalculatorRegistry {
    const reg = new CalculatorRegistry();
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.calculator\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
      .sort();
    for (const f of files) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path.join(dir, f)) as Record<string, unknown>;
      const def = isDefinition(mod.default) ? mod.default : Object.values(mod).find(isDefinition);
      if (!def) throw new Error(`${f} does not export a CalculatorDefinition`);
      reg.register(def);
    }
    return reg;
  }
}

export const CALCULATORS_DIR = path.join(__dirname, '..', 'calculators');
export const registry = CalculatorRegistry.loadFromDirectory(CALCULATORS_DIR);
