import { test as base, expect } from '@playwright/test';
import crypto from 'crypto';
import { test, CAN_RUN_AUTHED, AUTH_SKIP_REASON } from '../../helpers/auth';
import { RecipelyApi } from '../../helpers/api';
import { API_URL } from '../../helpers/config';

/**
 * Import jobs — the queue behind "Import a recipe" (`/recipes/import/*`) and the
 * worker-only routes the import fleet calls (`/internal/import-jobs/*`).
 *
 * Nothing here enqueues a real import: that downloads a video and calls a model.
 * These pin the boundaries — who may enqueue, what a job id reveals, and above
 * all that the worker routes refuse anyone without the worker secret. Claiming
 * or completing a job from outside would let a stranger write any recipe into
 * any user's drafts.
 */
const IMPORT_JOBS_PATH = '/recipes/import/jobs';
const importJobPath = (id: string): string => `/recipes/import/jobs/${id}`;

test.describe('Backend · import jobs', () => {
  base('enqueueing without a token returns an encrypted 401', async ({ request }) => {
    const result = await new RecipelyApi(request).post(IMPORT_JOBS_PATH, { url: 'https://www.instagram.com/reel/abc/' });
    expect(result.status).toBe(401);
    expect(result.envelope).toBeDefined();
  });

  base('reading a job without a token returns 401', async ({ request }) => {
    const result = await new RecipelyApi(request).get(importJobPath(crypto.randomUUID()));
    expect(result.status).toBe(401);
  });

  for (const route of ['claim', `${crypto.randomUUID()}/complete`, `${crypto.randomUUID()}/fail`]) {
    base(`the worker route /internal/import-jobs/${route.split('/').pop()} refuses a caller without the worker secret`, async ({ request }) => {
      const res = await request.post(`${API_URL}/internal/import-jobs/${route}`, { data: {} });
      // 401/403 when the routes are mounted; 404 when this host runs no worker routes at all.
      expect([401, 403, 404]).toContain(res.status());
      expect(res.status()).not.toBe(200);
      expect(res.status()).not.toBe(204);
    });
  }

  base('a wrong worker secret is refused too', async ({ request }) => {
    const res = await request.post(`${API_URL}/internal/import-jobs/claim`, {
      headers: { Authorization: 'Bearer not-the-worker-secret' },
      data: {},
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test.describe('authenticated', () => {
    test.skip(!CAN_RUN_AUTHED, AUTH_SKIP_REASON);

    test('a link that is not a supported video or page is refused without queueing', async ({ api, session }) => {
      const result = await api.post(IMPORT_JOBS_PATH, { url: 'not a link' }, session.token);
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(500);
    });

    test("someone else's (or nobody's) job id reads as not found", async ({ api, session }) => {
      const result = await api.get(importJobPath(crypto.randomUUID()), session.token);
      expect(result.status).toBe(404);
    });
  });
});
