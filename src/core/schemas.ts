import { z } from 'zod';

/*
 * 공통 DTO 조각. .describe()/.meta()는 zod v4에서 인스턴스에 붙으므로 항상 마지막에 호출한다
 * (이후 .min() 등을 체이닝하면 메타가 유실됨).
 */

export const sex = z.enum(['M', 'F']).describe('성별 (M=남성, F=여성)');

export const ageYears = z.number().int().min(0).max(130).describe('만 나이 [years]');

export const adultAgeYears = z
  .number()
  .int()
  .min(18)
  .max(130)
  .describe('만 나이 [years] (성인 전용 공식, 18세 이상)');

/** 양수 임상 수치 (단위·예시를 OpenAPI에 노출) */
export const positive = (label: string, unit: string, example?: number) =>
  z
    .number()
    .positive()
    .describe(`${label} [${unit}]`)
    .meta({ ...(example !== undefined ? { example } : {}), 'x-unit': unit });

/** 0 허용 임상 수치 */
export const nonNegative = (label: string, unit: string, example?: number) =>
  z
    .number()
    .nonnegative()
    .describe(`${label} [${unit}]`)
    .meta({ ...(example !== undefined ? { example } : {}), 'x-unit': unit });

/** 결과 소수 자릿수 (레거시 DECIMAL_PLACE 대응) */
export const precision = (defaultPlaces: number) =>
  z
    .number()
    .int()
    .min(0)
    .max(6)
    .default(defaultPlaces)
    .describe(`결과 소수 자릿수 (기본 ${defaultPlaces})`);
