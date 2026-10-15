import { test as base, expect } from '@playwright/test';
import { test, CAN_RUN_AUTHED, AUTH_SKIP_REASON } from '../../helpers/auth';
import { RecipelyApi } from '../../helpers/api';
import { dataOf, quietly } from '../../helpers/live';
import { projectDay, projectMonth } from '../../helpers/calendar';
import {
  diaryDayPath,
  diaryWaterPath,
  diaryMonthPath,
  DIARY_RECENT_PATH,
  DIARY_GOALS_PATH,
  DIARY_ENTRIES_PATH,
  diaryEntryPath,
  DIARY_FOOD_SEARCH_PATH,
  DIARY_FOOD_CATEGORIES_PATH,
  DIARY_FOOD_PRODUCTS_PATH,
  DIARY_FOOD_RECENT_PATH,
} from '../../helpers/config';

interface DiaryEntry {
  id: string;
  name: string;
  meal: string;
  servings: number;
}

/**
 * Meal log (diary) — `/diary/*`. Writes go to this project's far-future day
 * (helpers/calendar.ts) and are removed afterwards; goals are written back
 * unchanged, so the account's real targets never move.
 */
test.describe('Backend · diary service', () => {
  base('reading a day without a token returns an encrypted 401', async ({ request }) => {
    const result = await new RecipelyApi(request).get(diaryDayPath('2031-01-01'));
    expect(result.status).toBe(401);
    expect(result.envelope).toBeDefined();
  });

  test.describe('authenticated', () => {
    test.skip(!CAN_RUN_AUTHED, AUTH_SKIP_REASON);

    test('a day carries entries, water, totals and goals', async ({ api, session }, info) => {
      const day = await api.get(diaryDayPath(projectDay(info, 20)), session.token);
      expect(day.status).toBe(200);
      const data = dataOf(day);
      expect(data.date).toBe(projectDay(info, 20));
      expect(Array.isArray(data.entries)).toBe(true);
      expect(typeof data.waterGlasses).toBe('number');
      expect(typeof data.totals.calories).toBe('number');
      expect(typeof data.goals.calories).toBe('number');
    });

    test('a month, the recent list and an invalid date', async ({ api, session }, info) => {
      const month = await api.get(diaryMonthPath(projectMonth(info)), session.token);
      expect(month.status).toBe(200);
      expect(dataOf(month).month).toBe(projectMonth(info));
      const recent = await api.get(DIARY_RECENT_PATH, session.token);
      expect(recent.status).toBe(200);
      const bad = await api.get(diaryDayPath('2031-02-30'), session.token);
      expect(bad.status).toBe(400);
    });

    test('goals are read and written back unchanged; an out-of-range goal is refused', async ({ api, session }) => {
      const goals = dataOf(await api.get(DIARY_GOALS_PATH, session.token));
      expect(typeof goals.calories).toBe('number');
      const same = await api.put(DIARY_GOALS_PATH, goals, session.token);
      expect(same.status, JSON.stringify(same.decrypted)).toBe(200);
      const tooLow = await api.put(DIARY_GOALS_PATH, { ...goals, calories: 100 }, session.token);
      expect(tooLow.status).toBe(400);
    });

    test('food catalogue: search, categories, products, recent', async ({ api, session }) => {
      const search = await api.get(`${DIARY_FOOD_SEARCH_PATH}?q=egg&pageSize=3`, session.token);
      expect(search.status).toBe(200);
      expect(dataOf(search).products.items.length).toBeGreaterThan(0);
      const categories = await api.get(DIARY_FOOD_CATEGORIES_PATH, session.token);
      expect(categories.status).toBe(200);
      expect(dataOf(categories).items.length).toBeGreaterThan(0);
      const category = dataOf(categories).items[0].key as string;
      const products = await api.get(`${DIARY_FOOD_PRODUCTS_PATH}?category=${category}&pageSize=2`, session.token);
      expect(products.status).toBe(200);
      expect(typeof dataOf(products).total).toBe('number');
      const recent = await api.get(`${DIARY_FOOD_RECENT_PATH}?pageSize=2`, session.token);
      expect(recent.status).toBe(200);
      expect(Array.isArray(dataOf(recent).items)).toBe(true);
    });

    test('a quick-add entry is logged, totalled, edited and removed; water is set and reset', async ({ api, session }, info) => {
      const token = session.token;
      const date = projectDay(info, 21);
      const name = `E2E-${Date.now()} toast`;
      let entryId: string | undefined;
      try {
        const created = await api.post(
          DIARY_ENTRIES_PATH,
          { date, meal: 'BREAKFAST', name, servings: 1, calories: 250, protein: 8, carbs: 30, fat: 9 },
          token,
        );
        expect(created.status, JSON.stringify(created.decrypted)).toBe(201);

        const day = dataOf(await api.get(diaryDayPath(date), token));
        const entry = (day.entries as DiaryEntry[]).find((e) => e.name === name);
        expect(entry, 'the entry is on its day').toBeTruthy();
        entryId = entry!.id;
        expect(day.totals.calories).toBeGreaterThanOrEqual(250);

        const edited = await api.patch(diaryEntryPath(entryId), { servings: 2, meal: 'SNACK' }, token);
        expect(edited.status, JSON.stringify(edited.decrypted)).toBe(200);

        const water = await api.put(diaryWaterPath(date), { glasses: 3 }, token);
        expect(water.status, JSON.stringify(water.decrypted)).toBe(200);
        expect(dataOf(await api.get(diaryDayPath(date), token)).waterGlasses).toBe(3);
        const tooMuch = await api.put(diaryWaterPath(date), { glasses: 99 }, token);
        expect(tooMuch.status).toBe(400);

        const removed = await api.del(diaryEntryPath(entryId), token);
        expect([200, 204]).toContain(removed.status);
        entryId = undefined;
      } finally {
        if (entryId) await quietly(() => api.del(diaryEntryPath(entryId!), token));
        await quietly(() => api.put(diaryWaterPath(date), { glasses: 0 }, token));
      }
    });
  });
});
