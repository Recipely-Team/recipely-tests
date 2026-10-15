import { test as base, expect } from '@playwright/test';
import { test, CAN_RUN_AUTHED, AUTH_SKIP_REASON } from '../../helpers/auth';
import { RecipelyApi } from '../../helpers/api';
import { dataOf, quietly } from '../../helpers/live';
import {
  SHOPPING_LIST_PATH,
  SHOPPING_SUMMARY_PATH,
  SHOPPING_ITEMS_PATH,
  SHOPPING_CHECKED_PATH,
  shoppingItemPath,
} from '../../helpers/config';

interface ShoppingItem {
  id: string;
  label: string;
  checked: boolean;
}

/**
 * Shopping list — `/me/shopping-list`. The list is one per account and
 * "clear checked" is account-wide, so the writing tests run once, serially, on
 * `backend-direct`; the mobile axis covers the reads and the validation.
 * Every item added is deleted by id afterwards.
 */
test.describe('Backend · shopping list service', () => {
  base('reading the list without a token returns an encrypted 401', async ({ request }) => {
    const result = await new RecipelyApi(request).get(SHOPPING_LIST_PATH);
    expect(result.status).toBe(401);
    expect(result.envelope).toBeDefined();
  });

  test.describe('authenticated', () => {
    test.skip(!CAN_RUN_AUTHED, AUTH_SKIP_REASON);

    test('the list is a page envelope and the summary a count', async ({ api, session }) => {
      const list = await api.get(`${SHOPPING_LIST_PATH}?page=1&pageSize=10`, session.token);
      expect(list.status).toBe(200);
      expect(Array.isArray(dataOf(list).items)).toBe(true);
      expect(typeof dataOf(list).total).toBe('number');
      const summary = await api.get(SHOPPING_SUMMARY_PATH, session.token);
      expect(summary.status).toBe(200);
      expect(typeof dataOf(summary).unchecked).toBe('number');
    });

    test('an empty batch and a blank label are refused', async ({ api, session }) => {
      const empty = await api.post(SHOPPING_ITEMS_PATH, { items: [] }, session.token);
      expect(empty.status).toBe(400);
      const blank = await api.post(SHOPPING_ITEMS_PATH, { items: [{ label: '   ' }] }, session.token);
      expect(blank.status).toBe(400);
    });

    test.describe('writes', () => {
      test.describe.configure({ mode: 'serial' });
      const added: string[] = [];
      test.beforeEach(({}, info) => test.skip(info.project.name !== 'backend-direct', 'Account-wide writes run once, on backend-direct.'));
      test.afterAll(async ({ api, session }) => {
        for (const id of added) await quietly(() => api.del(shoppingItemPath(id), session.token));
      });

      const findItems = async (api: RecipelyApi, token: string, labels: string[]): Promise<ShoppingItem[]> => {
        const list = await api.get(`${SHOPPING_LIST_PATH}?pageSize=100`, token);
        return ((dataOf(list).items ?? []) as ShoppingItem[]).filter((i) => labels.includes(i.label));
      };

      test('a batch is added, counted, edited, ticked and cleared', async ({ api, session }) => {
        const token = session.token;
        const stamp = Date.now();
        const labels = [`E2E-${stamp} flour`, `E2E-${stamp} milk`];
        const before = dataOf(await api.get(SHOPPING_SUMMARY_PATH, token)).unchecked as number;

        const created = await api.post(
          SHOPPING_ITEMS_PATH,
          { items: [{ label: labels[0], quantity: 500, unit: 'g' }, { label: labels[1], quantity: null, unit: null }] },
          token,
        );
        expect(created.status, JSON.stringify(created.decrypted)).toBe(201);
        const mine = await findItems(api, token, labels);
        expect(mine).toHaveLength(2);
        added.push(...mine.map((i) => i.id));

        const summary = dataOf(await api.get(SHOPPING_SUMMARY_PATH, token)).unchecked as number;
        expect(summary).toBe(before + 2);

        const flour = mine.find((i) => i.label === labels[0])!;
        const renamed = await api.patch(shoppingItemPath(flour.id), { label: `${labels[0]} (whole)`, quantity: 1, unit: 'kg' }, token);
        expect(renamed.status).toBe(200);
        expect(dataOf(renamed).label).toBe(`${labels[0]} (whole)`);

        const ticked = await api.patch(shoppingItemPath(flour.id), { checked: true }, token);
        expect(ticked.status).toBe(200);
        expect(dataOf(ticked).checked).toBe(true);

        const cleared = await api.del(SHOPPING_CHECKED_PATH, token);
        expect([200, 204]).toContain(cleared.status);
        const left = await findItems(api, token, [`${labels[0]} (whole)`, labels[1]]);
        expect(left.map((i) => i.label)).toEqual([labels[1]]);
        added.splice(added.indexOf(flour.id), 1);
      });

      test('an empty edit and an unknown item are refused', async ({ api, session }) => {
        const unknown = await api.patch(shoppingItemPath('00000000-0000-4000-8000-000000000000'), { checked: true }, session.token);
        expect(unknown.status).toBe(404);
        const id = added[0];
        test.skip(!id, 'Needs the item left by the batch test.');
        const empty = await api.patch(shoppingItemPath(id), {}, session.token);
        expect(empty.status).toBe(400);
      });
    });
  });
});
