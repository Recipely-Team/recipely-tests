import { test as base, expect } from '@playwright/test';
import crypto from 'crypto';
import { test, CAN_RUN_AUTHED, AUTH_SKIP_REASON } from '../../helpers/auth';
import { RecipelyApi } from '../../helpers/api';

/**
 * Publishing — `PATCH /recipes/:id`, `POST /recipes/:id/publish|unpublish`.
 * Only the owner may change or publish a recipe. These never publish anything:
 * they check that a stranger is refused and an unknown id changes nothing.
 */
const OPS = [
  { name: 'publish', run: (api: RecipelyApi, id: string, token?: string) => api.post(`/recipes/${id}/publish`, {}, token) },
  { name: 'unpublish', run: (api: RecipelyApi, id: string, token?: string) => api.post(`/recipes/${id}/unpublish`, {}, token) },
  { name: 'edit', run: (api: RecipelyApi, id: string, token?: string) => api.patch(`/recipes/${id}`, { title: 'E2E should never land' }, token) },
] as const;

test.describe('Backend · recipe publication', () => {
  for (const op of OPS) {
    base(`${op.name} without a token returns 401`, async ({ request }) => {
      const result = await op.run(new RecipelyApi(request), crypto.randomUUID());
      expect(result.status).toBe(401);
    });
  }

  test.describe('authenticated', () => {
    test.skip(!CAN_RUN_AUTHED, AUTH_SKIP_REASON);

    for (const op of OPS) {
      test(`${op.name} on a recipe that does not exist changes nothing`, async ({ api, session }) => {
        const result = await op.run(api, crypto.randomUUID(), session.token);
        // 400 when the body is refused before the lookup; never a success.
        expect([400, 403, 404]).toContain(result.status);
      });
    }
  });
});
