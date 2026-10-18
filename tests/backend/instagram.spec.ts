import { test as base, expect } from '@playwright/test';
import crypto from 'crypto';
import { test, CAN_RUN_AUTHED, AUTH_SKIP_REASON } from '../../helpers/auth';
import { RecipelyApi } from '../../helpers/api';
import { API_URL } from '../../helpers/config';

/**
 * Instagram — the connection and comment-to-DM rules (`/me/instagram/*`), the
 * login start (`/auth/instagram/start`), the public DM-open counter
 * (`/instagram/dm-sends/:id/open`) and Meta's webhooks (`/webhooks/instagram*`).
 *
 * The webhooks are the sharp edge: Meta signs every call, and an unsigned POST
 * must be refused, or anyone could feed fake comments into the DM sender. None
 * of these connect an account or send a message.
 */
test.describe('Backend · Instagram', () => {
  for (const path of ['/me/instagram', '/me/instagram/rules', '/me/instagram/media', '/me/instagram/stats', '/auth/instagram/start']) {
    base(`${path} without a token returns 401`, async ({ request }) => {
      const result = await new RecipelyApi(request).get(path);
      expect(result.status).toBe(401);
    });
  }

  base('the webhook verification refuses a wrong verify token', async ({ request }) => {
    const res = await request.get(`${API_URL}/webhooks/instagram`, {
      params: { 'hub.mode': 'subscribe', 'hub.verify_token': 'definitely-wrong', 'hub.challenge': '42' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(await res.text()).not.toBe('42');
  });

  base('an unsigned webhook event is refused', async ({ request }) => {
    const res = await request.post(`${API_URL}/webhooks/instagram`, {
      headers: { 'Content-Type': 'application/json' },
      data: { object: 'instagram', entry: [{ id: '1', changes: [{ field: 'comments', value: { text: 'tarif' } }] }] },
    });
    expect([400, 401, 403]).toContain(res.status());
  });

  base('the login callback without a code does not succeed', async ({ request }) => {
    const res = await request.get(`${API_URL}/auth/instagram/callback`, { maxRedirects: 0 });
    expect(res.status()).not.toBe(200);
  });

  // The beacon answers 204 for ANY well-formed id on purpose: telling "exists"
  // from "does not" would let a stranger enumerate which DMs were sent.
  base('the DM-open beacon does not reveal whether a send exists', async ({ request }) => {
    const result = await new RecipelyApi(request).post(`/instagram/dm-sends/${crypto.randomUUID()}/open`, {});
    expect(result.status).toBe(204);
  });

  base('the DM-open beacon refuses an id that is not an id', async ({ request }) => {
    const result = await new RecipelyApi(request).post('/instagram/dm-sends/not-an-id/open', {});
    expect(result.status).toBe(400);
  });

  test.describe('authenticated', () => {
    test.skip(!CAN_RUN_AUTHED, AUTH_SKIP_REASON);

    test('the connection reads back for an account with no Instagram linked', async ({ api, session }) => {
      const result = await api.get('/me/instagram', session.token);
      expect(result.status).toBe(200);
    });

    test('a rule that does not exist reads as not found', async ({ api, session }) => {
      const result = await api.get(`/me/instagram/rules/${crypto.randomUUID()}`, session.token);
      expect([403, 404]).toContain(result.status);
    });
  });
});
