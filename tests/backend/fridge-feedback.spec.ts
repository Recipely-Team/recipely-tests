import { test as base, expect } from '@playwright/test';
import { test, CAN_RUN_AUTHED, AUTH_SKIP_REASON } from '../../helpers/auth';
import { RecipelyApi } from '../../helpers/api';
import { errorOf } from '../../helpers/live';
import { FRIDGE_IDEAS_PATH, FRIDGE_SCAN_PATH, FEEDBACK_PATH, DIARY_MEAL_PARSE_PATH } from '../../helpers/config';

/**
 * Contract-only checks for the model-backed and write-once endpoints: the
 * fridge scan and ideas, the text meal parse, and in-app feedback. Every
 * request here is refused BEFORE a model is called or a row is written —
 * the real round-trips live in the gated `live-*` specs.
 */
test.describe('Backend · fridge, meal parse and feedback contracts', () => {
  base('fridge, meal parse and feedback refuse a guest', async ({ request }) => {
    const api = new RecipelyApi(request);
    expect((await api.post(FRIDGE_IDEAS_PATH, { ingredients: ['egg'] })).status).toBe(401);
    expect((await api.post(FRIDGE_SCAN_PATH, {})).status).toBe(401);
    expect((await api.post(DIARY_MEAL_PARSE_PATH, { text: 'toast' })).status).toBe(401);
    expect((await api.post(FEEDBACK_PATH, { category: 'bug', message: 'x' })).status).toBe(401);
  });

  test.describe('authenticated', () => {
    test.skip(!CAN_RUN_AUTHED, AUTH_SKIP_REASON);

    // The AI rate limiter counts a refused request too, so this spends one
    // unit of the test account's model quota: once per run, on backend-direct.
    test('fridge ideas need at least one ingredient', async ({ api, session }, info) => {
      test.skip(info.project.name !== 'backend-direct', 'Spends AI quota: runs once, on backend-direct.');
      const result = await api.post(FRIDGE_IDEAS_PATH, { ingredients: [] }, session.token);
      expect(result.status).toBe(400);
      expect(JSON.stringify(errorOf(result))).toContain('fridge');
    });

    test('feedback refuses an unknown category and an empty message', async ({ api, session }) => {
      expect((await api.post(FEEDBACK_PATH, { category: 'praise', message: 'hi' }, session.token)).status).toBe(400);
      expect((await api.post(FEEDBACK_PATH, { category: 'bug', message: '   ' }, session.token)).status).toBe(400);
    });
  });
});
