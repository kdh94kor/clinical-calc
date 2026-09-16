import { z } from 'zod';
import type { CalculatorDefinition } from '../core/calculator';
import type { CalculatorRegistry } from '../core/registry';

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
  const limitations =
    def.limitations && def.limitations.length > 0
      ? ['', '**적용 한계 및 주의사항 (Limitations)**', ...def.limitations.map((l) => `- ⚠️ ${l}`)].join('\n')
      : '';
  return [
    def.summary,
    limitations,
    '',
    '**Formula**',
    '',
    '```',
    def.formula,
    '```',
    '',
    '**References**',
    refs,
    def.legacySource ? `\n**Legacy source**: \`${def.legacySource}\`` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const successEnvelope = (dataSchema: Json): Json => ({
  type: 'object',
  required: ['success', 'data', 'meta'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    data: dataSchema,
    meta: {
      type: 'object',
      required: ['apiVersion', 'timestamp', 'disclaimer'],
      properties: {
        apiVersion: { type: 'string', example: '1.0.0' },
        timestamp: { type: 'string', format: 'date-time' },
        calculator: { type: 'string' },
        disclaimer: { type: 'string' },
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
        '임상 검사 수치·생화학 지표·약동학 통합 계산 서비스.',
        '',
        '### ⚠️ 사용 조건 및 법적 면책 고지 (Clinical & Legal Disclaimer)',
        '> **본 서비스의 계산 결과는 공식 수식에 기반한 참고치이며, 의학적 진단·처방이나 의료진의 임상적 판단을 대체하지 않습니다.**',
        '> 모든 최종 해석과 치료 결정은 반드시 면허를 가진 의료인이 환자의 전반적인 상태와 원시 검사값을 직접 확인한 후 내려야 합니다.',
        '> *This service provides formula-based calculations for clinical decision support only and does not constitute medical advice, diagnosis, or treatment.*',
        '',
        '모든 응답은 `{success, data, meta}` 또는 `{success:false, error}` 봉투(envelope)로 반환됩니다.',
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
