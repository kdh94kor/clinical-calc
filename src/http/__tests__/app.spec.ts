import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

describe('HTTP envelope contract', () => {
  it('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'up', calculators: 29 } });
  });

  it('GET /api/v1/calculators lists every calculator with endpoint', async () => {
    const res = await request(app).get('/api/v1/calculators');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'FIB4', endpoint: '/api/v1/calculators/FIB4' })]));
  });

  it('GET /api/v1/calculators/:code returns formula, references, limitations, JSON schemas', async () => {
    const res = await request(app).get('/api/v1/calculators/egfr');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ code: 'EGFR' });
    expect(res.body.data.formula).toContain('142');
    expect(res.body.data.references.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.data.limitations)).toBe(true);
    expect(res.body.data.limitations.length).toBeGreaterThan(0);
    expect(res.body.data.inputSchema.properties.serumCreatinine).toMatchObject({ type: 'number', 'x-unit': 'mg/dL' });
  });

  it('POST success → { success:true, data, meta.calculator }', async () => {
    const res = await request(app).post('/api/v1/calculators/glob').send({ totalProtein: 7.2, albumin: 4.3 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { globulin: 2.9 },
      meta: { calculator: 'GLOB', apiVersion: '1.0.0' },
    });
    expect(typeof res.body.meta.timestamp).toBe('string');
    expect(typeof res.body.meta.disclaimer).toBe('string');
    expect(res.body.meta.disclaimer).toContain('임상 판단·처방을 대체하지 않습니다');
  });

  it('POST validation failure → 400 VALIDATION_ERROR with details', async () => {
    const res = await request(app).post('/api/v1/calculators/GLOB').send({ totalProtein: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'totalProtein' })]));
  });

  it('POST unknown calculator → 404 CALCULATOR_NOT_FOUND', async () => {
    const res = await request(app).post('/api/v1/calculators/NOPE').send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CALCULATOR_NOT_FOUND');
  });

  it('malformed JSON → 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/v1/calculators/GLOB').set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('unknown route → 404 NOT_FOUND envelope', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('GET /openapi.json is OpenAPI 3.0 with one POST per calculator, formula + references in description', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    const post = res.body.paths['/api/v1/calculators/EGFR'].post;
    expect(post.description).toContain('**Formula**');
    expect(post.description).toContain('**References**');
    expect(post.description).toContain('적용 한계');
    expect(post.description).toContain('NEJMoa2102953');
    expect(post.requestBody.content['application/json'].schema.properties.serumCreatinine['x-unit']).toBe('mg/dL');
    expect(post.requestBody.content['application/json'].schema.required).not.toContain('method'); // default 있는 필드는 optional
    expect(post.responses['200'].content['application/json'].schema.properties.data.properties.egfr.type).toBe('number');
    expect(Object.keys(res.body.paths).filter((p) => res.body.paths[p].post)).toHaveLength(29);
  });

  it('GET /docs serves Swagger UI', async () => {
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
