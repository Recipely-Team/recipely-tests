import { test as base, expect } from '@playwright/test';
import { test, CAN_RUN_AUTHED, AUTH_SKIP_REASON } from '../../helpers/auth';
import { API_URL } from '../../helpers/config';

/**
 * Uploads — `POST /upload` (recipe photos) and `POST /me/avatar`. Both take
 * multipart bodies outside the encrypted `/api/v1` channel, so they are the
 * easiest place for an anonymous or non-image upload to slip through. Nothing
 * here stores a file: every request is one the server must refuse.
 */
const NOT_AN_IMAGE = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') };

test.describe('Backend · uploads', () => {
  for (const [route, field] of [['/upload', 'file'], ['/me/avatar', 'avatar']] as const) {
    base(`${route} refuses an anonymous upload`, async ({ request }) => {
      const res = await request.post(`${API_URL}${route}`, { multipart: { [field]: NOT_AN_IMAGE } });
      expect(res.status()).toBe(401);
    });
  }

  test.describe('authenticated', () => {
    test.skip(!CAN_RUN_AUTHED, AUTH_SKIP_REASON);

    test('/me/avatar refuses a file that is not an image', async ({ request, session }) => {
      const res = await request.post(`${API_URL}/me/avatar`, {
        headers: { Authorization: `Bearer ${session.token}` },
        multipart: { avatar: NOT_AN_IMAGE },
      });
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
    });
  });
});
