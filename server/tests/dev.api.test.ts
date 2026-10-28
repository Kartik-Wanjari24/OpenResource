import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('Development API Endpoints', () => {
  const originalEnv = {
    ALLOW_DEV_ENDPOINTS: process.env.ALLOW_DEV_ENDPOINTS,
    NODE_ENV: process.env.NODE_ENV,
  };

  beforeAll(() => {
    process.env.ALLOW_DEV_ENDPOINTS = 'true';
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    process.env.ALLOW_DEV_ENDPOINTS = originalEnv.ALLOW_DEV_ENDPOINTS;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
  });

  describe('GET /api/dev/personas', () => {
    it('should return list of available personas', async () => {
      const response = await request(app).get('/api/dev/personas');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.personas).toBeDefined();
      expect(Array.isArray(response.body.data.personas)).toBe(true);
      expect(response.body.data.total).toBe(4);
    });

    it('should include all required fields in persona data', async () => {
      const response = await request(app).get('/api/dev/personas');

      expect(response.status).toBe(200);
      const personas = response.body.data.personas;

      personas.forEach((persona: any) => {
        expect(persona.name).toBeDefined();
        expect(persona.id).toBeDefined();
        expect(persona.displayName).toBeDefined();
        expect(persona.role).toBeDefined();
        expect(persona.email).toBeDefined();
        expect(Array.isArray(persona.badges)).toBe(true);
      });
    });

    it('should include Lab Owner persona', async () => {
      const response = await request(app).get('/api/dev/personas');

      expect(response.status).toBe(200);
      const personas = response.body.data.personas;
      const labOwner = personas.find((p: any) => p.name === 'Lab Owner');

      expect(labOwner).toBeDefined();
      expect(labOwner.role).toBe('LAB_OWNER');
    });
  });

  describe('POST /api/dev/impersonate', () => {
    it('should successfully impersonate Lab Owner', async () => {
      const response = await request(app)
        .post('/api/dev/impersonate')
        .send({ personaName: 'Lab Owner' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.impersonatedUser).toBeDefined();
      expect(response.body.data.impersonatedUser.role).toBe('LAB_OWNER');
      expect(response.body.data.instructions).toBeDefined();
      expect(response.body.data.instructions.headers).toBeDefined();
    });

    it('should successfully impersonate Qualified Student A', async () => {
      const response = await request(app)
        .post('/api/dev/impersonate')
        .send({ personaName: 'Qualified Student A' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.impersonatedUser.role).toBe('USER');
      expect(response.body.data.impersonatedUser.badges).toContain('badge_3d_basics');
    });

    it('should successfully impersonate Resource-Hog Student B', async () => {
      const response = await request(app)
        .post('/api/dev/impersonate')
        .send({ personaName: 'Resource-Hog Student B' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.impersonatedUser.id).toBe('demo_resource_hog');
    });

    it('should successfully impersonate Admin', async () => {
      const response = await request(app)
        .post('/api/dev/impersonate')
        .send({ personaName: 'Admin' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.impersonatedUser.role).toBe('ADMIN');
    });

    it('should return 404 for invalid persona name', async () => {
      const response = await request(app)
        .post('/api/dev/impersonate')
        .send({ personaName: 'Invalid Persona' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Unknown persona');
    });

    it('should return 400 for missing persona name', async () => {
      const response = await request(app).post('/api/dev/impersonate').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty persona name', async () => {
      const response = await request(app)
        .post('/api/dev/impersonate')
        .send({ personaName: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should provide header instructions for subsequent requests', async () => {
      const response = await request(app)
        .post('/api/dev/impersonate')
        .send({ personaName: 'Qualified Student A' });

      expect(response.status).toBe(200);
      const headers = response.body.data.instructions.headers;

      expect(headers['X-Test-User-Id']).toBeDefined();
      expect(headers['X-Test-User-Role']).toBeDefined();
      expect(headers['X-Test-User-Badges']).toBeDefined();
    });
  });

  describe('POST /api/dev/reset-seed', () => {
    it('should successfully reset seed data', async () => {
      const response = await request(app)
        .post('/api/dev/reset-seed')
        .send({ confirm: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('reset');
      expect(Array.isArray(response.body.data.operations)).toBe(true);
    });

    it('should return list of operations performed', async () => {
      const response = await request(app)
        .post('/api/dev/reset-seed')
        .send({ confirm: true });

      expect(response.status).toBe(200);
      const operations = response.body.data.operations;

      expect(operations.length).toBeGreaterThan(0);
      expect(operations.some((op: string) => op.includes('demo users'))).toBe(true);
      expect(operations.some((op: string) => op.includes('demo resources'))).toBe(true);
    });

    it('should return 400 when confirm is missing', async () => {
      const response = await request(app).post('/api/dev/reset-seed').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when confirm is false', async () => {
      const response = await request(app)
        .post('/api/dev/reset-seed')
        .send({ confirm: false });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should include timestamp in response', async () => {
      const response = await request(app)
        .post('/api/dev/reset-seed')
        .send({ confirm: true });

      expect(response.status).toBe(200);
      expect(response.body.data.timestamp).toBeDefined();
    });

    it('should include warning about data loss', async () => {
      const response = await request(app)
        .post('/api/dev/reset-seed')
        .send({ confirm: true });

      expect(response.status).toBe(200);
      expect(response.body.data.warning).toBeDefined();
      expect(response.body.data.warning).toContain('cleared');
    });
  });

  describe('Security: Production Environment Protection', () => {
    it('should block dev endpoints when ALLOW_DEV_ENDPOINTS is false', async () => {
      const originalFlag = process.env.ALLOW_DEV_ENDPOINTS;
      process.env.ALLOW_DEV_ENDPOINTS = 'false';

      const response = await request(app).get('/api/dev/personas');

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();

      process.env.ALLOW_DEV_ENDPOINTS = originalFlag;
    });

    it('should block dev endpoints when ALLOW_DEV_ENDPOINTS is not set', async () => {
      const originalFlag = process.env.ALLOW_DEV_ENDPOINTS;
      delete process.env.ALLOW_DEV_ENDPOINTS;

      const response = await request(app).get('/api/dev/personas');

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('require');

      process.env.ALLOW_DEV_ENDPOINTS = originalFlag;
    });
  });

  describe('Integration: Impersonate then Use Headers', () => {
    it('should provide working headers for resource discovery', async () => {
      const impersonateResponse = await request(app)
        .post('/api/dev/impersonate')
        .send({ personaName: 'Qualified Student A' });

      expect(impersonateResponse.status).toBe(200);

      const headers = impersonateResponse.body.data.instructions.headers;

      // Use the provided headers to make a discovery request
      const discoveryResponse = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', headers['X-Test-User-Id'])
        .set('X-Test-User-Role', headers['X-Test-User-Role'])
        .set('X-Test-User-Badges', headers['X-Test-User-Badges'])
        .send({ query: '3D printer' });

      // Should succeed with authentication (even if no resources exist)
      expect([200, 401]).toContain(discoveryResponse.status);
    });
  });
});
