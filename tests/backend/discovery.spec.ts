import { test as base, expect } from '@playwright/test';
import { test, CAN_RUN_AUTHED, AUTH_SKIP_REASON } from '../../helpers/auth';
import { RecipelyApi } from '../../helpers/api';
import { dataOf } from '../../helpers/live';
import {
  FLAGS_PATH,
  RECIPES_TRENDING_PATH,
  USERS_CREATORS_PATH,
  ME_LIKES_PATH,
  ME_DEVICES_PATH,
  ME_INSTAGRAM_PATH,
} from '../../helpers/config';

/**
 * The read surfaces added after the first suite: remote feature flags,
 * trending recipes and the Chefs list (guest-readable), and the signed-in
 * user's likes, devices and Instagram link status.
 */
test.describe('Backend · discovery and account reads', () => {
  base('feature flags are public and a name → boolean map', async ({ request }) => {
    const result = await new RecipelyApi(request).get(FLAGS_PATH);
    expect(result.status).toBe(200);
    const flags = dataOf(result)?.flags as Record<string, unknown> | undefined;
    expect(flags).toBeDefined();
    for (const value of Object.values(flags ?? {})) expect(typeof value).toBe('boolean');
  });

  base('trending recipes are readable by a guest', async ({ request }) => {
    const result = await new RecipelyApi(request).get(RECIPES_TRENDING_PATH);
    expect(result.status).toBe(200);
    const items = dataOf(result)?.items as Array<{ id?: string; name?: string }> | undefined;
    expect(Array.isArray(items)).toBe(true);
    for (const r of items ?? []) expect(typeof r.id).toBe('string');
  });

  base('the Chefs list is a page envelope readable by a guest', async ({ request }) => {
    const result = await new RecipelyApi(request).get(`${USERS_CREATORS_PATH}?page=1&pageSize=5`);
    expect(result.status).toBe(200);
    const data = dataOf(result);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
    for (const c of data.items as Array<{ creatorTags?: unknown[]; recipeCount?: number }>) {
      expect(Array.isArray(c.creatorTags)).toBe(true);
      expect(typeof c.recipeCount).toBe('number');
    }
  });

  base('account reads without a token return 401', async ({ request }) => {
    const api = new RecipelyApi(request);
    for (const path of [ME_LIKES_PATH, ME_DEVICES_PATH, ME_INSTAGRAM_PATH]) {
      expect((await api.get(path)).status, path).toBe(401);
    }
  });

  test.describe('authenticated', () => {
    test.skip(!CAN_RUN_AUTHED, AUTH_SKIP_REASON);

    test('/me/likes is a page envelope', async ({ api, session }) => {
      const result = await api.get(`${ME_LIKES_PATH}?page=1&pageSize=5`, session.token);
      expect(result.status).toBe(200);
      expect(Array.isArray(dataOf(result).items)).toBe(true);
    });

    test('/me/devices lists the devices that signed in', async ({ api, session }) => {
      const result = await api.get(ME_DEVICES_PATH, session.token);
      expect(result.status).toBe(200);
      const devices = dataOf(result) as Array<{ deviceId?: string; platform?: string }>;
      expect(Array.isArray(devices)).toBe(true);
      for (const d of devices) expect(typeof d.platform).toBe('string');
    });

    test('/me/instagram reports the link status', async ({ api, session }) => {
      const result = await api.get(ME_INSTAGRAM_PATH, session.token);
      expect(result.status).toBe(200);
      expect(typeof dataOf(result).connected).toBe('boolean');
      expect(typeof dataOf(result).available).toBe('boolean');
    });
  });
});
