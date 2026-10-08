import { z } from 'zod';
import type { CalculatorDefinition } from '../core/calculator';
import type { CalculatorRegistry } from '../core/registry';
import { DISCLAIMER } from './envelope';

type Json = Record<string, unknown>;

function schemaOf(schema: z.ZodType, io: 'input' | 'output'): Json {
  const js = z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' }) as Json;
  delete js.$schema;
  return js;
}

function describe(def: CalculatorDefinition): string {
  const refs = def.references
    .map((r) => `- ${r.title}${r.url ? ` — ${r.url}` : ''}${r.note ? ` (${r.note})` : ''}`)
    .join('\n');
  return [
    def.summary,
    '',
    '**Formula**',
    '',
    '```',
    def.formula,
    '```',
    '',
    '**References**',
    refs,
    def.limitations?.length ? `\n**Limitations / Not validated for**\n${def.limitations.map((l) => `- ${l}`).join('\n')}` : '',
    def.legacySource ? `\n**Legacy source**: \`${def.legacySource}\`` : '',
    '',
    `> ${DISCLAIMER}`,
  ].join('\n');
}

const successEnvelope = (dataSchema: Json): Json => ({
  type: 'object',
  required: ['success', 'data', 'meta'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    data: dataSchema,
    meta: {
      type: 'object',
      required: ['timestamp', 'apiVersion', 'disclaimer'],
      properties: {
        timestamp: { type: 'string', format: 'date-time' },
        apiVersion: { type: 'string', description: '계산식 버전 식별자 (기록 보존 시 함께 저장)' },
        disclaimer: { type: 'string', description: '임상 판단 대체 불가 고지문' },
        calculator: { type: 'string' },
      },
    },
  },
});

const errorRef = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/FailureEnvelope' } } },
});

export function buildOpenApi(reg: CalculatorRegistry): Json {
  const paths: Json = {
    '/api/v1/calculators': {
      get: {
        tags: ['meta'],
        summary: '등록된 계산기 목록',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/api/v1/calculators/{code}': {
      get: {
        tags: ['meta'],
        summary: '계산기 메타데이터(공식·출처·입출력 JSON Schema)',
        parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' }, '404': errorRef('Unknown calculator') },
      },
    },
  };

  for (const def of reg.list()) {
    paths[`/api/v1/calculators/${def.code}`] = {
      post: {
        tags: [def.category],
        operationId: `calc_${def.code}`,
        summary: `${def.code} — ${def.name}`,
        description: describe(def),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: schemaOf(def.input, 'input'),
              ...(def.example !== undefined ? { example: def.example } : {}),
            },
          },
        },
        responses: {
          '200': {
            description: '계산 결과',
            content: { 'application/json': { schema: successEnvelope(schemaOf(def.output, 'output')) } },
          },
          '400': errorRef('입력 검증 실패 (VALIDATION_ERROR)'),
          '422': errorRef('계산 불가 (DIVISION_BY_ZERO / COMPUTATION_ERROR)'),
        },
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Clinical Calculator API',
      version: '1.0.0',
      description: [
        '임상 검사 수치·생화학 지표·약동학 통합 계산 서비스. 모든 응답은 `{success, data, meta}` 또는 `{success:false, error}` 봉투(envelope)로 반환됩니다.',
        '',
        '## 사용 조건 및 면책',
        `> ${DISCLAIMER}`,
        '',
        '- 결과는 입력된 값에만 의존합니다. 검체 오류·단위 오류·입력 오류로 인한 결과에 대해 서비스는 책임지지 않습니다.',
        '- 각 공식은 발표 논문의 대상 집단(연령·인종·임상 상황)에서 검증된 것이며, 각 operation의 *Limitations* 항목에 명시된 경우에는 적용할 수 없습니다.',
        '- 이 서비스는 결과를 저장하지 않습니다. 의무기록에 남기는 경우 호출 시점의 응답(`meta.apiVersion` 포함)을 그대로 보존해야 합니다.',
        '- 공식·계수는 가이드라인 개정에 따라 변경될 수 있으며 `meta.apiVersion`으로 식별합니다.',
      ].join('\n'),
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      schemas: {
        FailureEnvelope: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: { type: 'boolean', enum: [false] },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  enum: [
                    'VALIDATION_ERROR',
                    'CALCULATOR_NOT_FOUND',
                    'DIVISION_BY_ZERO',
                    'COMPUTATION_ERROR',
                    'NOT_FOUND',
                    'INTERNAL_ERROR',
                  ],
                },
                message: { type: 'string' },
                details: {},
              },
            },
          },
        },
      },
    },
  };
}
