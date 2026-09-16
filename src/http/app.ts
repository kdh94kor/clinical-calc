import express, { type ErrorRequestHandler, type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { CalcError } from '../core/errors';
import { registry as defaultRegistry, type CalculatorRegistry } from '../core/registry';
import { fail, ok } from './envelope';
import { buildOpenApi } from './openapi';

export function createApp(reg: CalculatorRegistry = defaultRegistry): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  const api = express.Router();

  api.get('/calculators', (_req, res) => {
    res.json(
      ok(
        reg.list().map((d) => ({
          code: d.code,
          name: d.name,
          category: d.category,
          summary: d.summary,
          endpoint: `/api/v1/calculators/${d.code}`,
        })),
      ),
    );
  });

  api.get('/calculators/:code', (req, res) => {
    const def = reg.get(String(req.params.code));
    if (!def) throw new CalcError('CALCULATOR_NOT_FOUND', `Unknown calculator: ${req.params.code}`, 404);
    res.json(
      ok(
        {
          code: def.code,
          name: def.name,
          category: def.category,
          summary: def.summary,
          formula: def.formula,
          references: def.references,
          limitations: def.limitations ?? [],
          legacySource: def.legacySource,
          example: def.example,
          inputSchema: z.toJSONSchema(def.input, { io: 'input', unrepresentable: 'any' }),
          outputSchema: z.toJSONSchema(def.output, { unrepresentable: 'any' }),
        },
        def.code,
      ),
    );
  });

  api.post('/calculators/:code', (req, res) => {
    const code = String(req.params.code).toUpperCase();
    res.json(ok(reg.run(code, req.body), code));
  });

  app.use('/api/v1', api);

  const doc = buildOpenApi(reg);
  app.get('/openapi.json', (_req, res) => res.json(doc));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(doc));
  app.get('/health', (_req, res) => res.json(ok({ status: 'up', calculators: reg.list().length })));

  app.use((_req, res) => res.status(404).json(fail('NOT_FOUND', 'Route not found')));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof CalcError) {
      res.status(err.status).json(fail(err.code, err.message, err.details));
      return;
    }
    // body-parser: 잘못된 JSON
    if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json(fail('VALIDATION_ERROR', 'Malformed JSON body'));
      return;
    }
    console.error(err);
    res.status(500).json(fail('INTERNAL_ERROR', 'Unexpected error'));
  };
  app.use(onError);

  return app;
}
