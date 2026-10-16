import { test as base, expect } from '@playwright/test';
import { test, CAN_RUN_AUTHED, AUTH_SKIP_REASON, createRecipe, deleteRecipe } from '../../helpers/auth';
import { RecipelyApi } from '../../helpers/api';
import { dataOf, errorOf, quietly } from '../../helpers/live';
import { projectDay } from '../../helpers/calendar';
import {
  MEAL_PLAN_PATH,
  MEAL_PLAN_INGREDIENTS_PATH,
  MEAL_PLAN_COPY_PATH,
  MEAL_PLAN_ENTRIES_PATH,
  mealPlanEntryPath,
  mealPlanEatenPath,
} from '../../helpers/config';

interface PlanEntry {
  id: string;
  date: string;
  meal: string;
  servings: number;
  recipeId?: string;
  recipe?: { id?: string };
}

const entriesOf = (r: Awaited<ReturnType<RecipelyApi['get']>>): PlanEntry[] => dataOf(r)?.entries ?? [];
const recipeIdOf = (e: PlanEntry): string | undefined => e.recipeId ?? e.recipe?.id;

/**
 * Meal planner — `/me/meal-plan`. Each project writes only inside its own
 * far-future week (helpers/calendar.ts) with its own throwaway recipe, so the
 * direct and mobile runs never see each other's rows. The range is cleared
 * and the recipe deleted afterwards.
 */
test.describe('Backend · meal plan service', () => {
  base('reading a plan without a token returns an encrypted 401', async ({ request }) => {
    const result = await new RecipelyApi(request).get(`${MEAL_PLAN_PATH}?from=2031-01-01&to=2031-01-07`);
    expect(result.status).toBe(401);
    expect(result.envelope).toBeDefined();
  });

  test.describe('authenticated', () => {
    test.skip(!CAN_RUN_AUTHED, AUTH_SKIP_REASON);
    test.describe.configure({ mode: 'serial' });

    test('a range longer than 14 days is refused with a catalogue key', async ({ api, session }, info) => {
      const result = await api.get(`${MEAL_PLAN_PATH}?from=${projectDay(info, 1)}&to=${projectDay(info, 20)}`, session.token);
      expect(result.status).toBe(400);
      expect(JSON.stringify(errorOf(result))).toContain('meal_plan_range');
    });

    test('an unknown meal slot is refused', async ({ api, session }, info) => {
      const result = await api.post(
        MEAL_PLAN_ENTRIES_PATH,
        { date: projectDay(info, 2), meal: 'BRUNCH', recipeId: '00000000-0000-4000-8000-000000000000', servings: 1 },
        session.token,
      );
      expect(result.status).toBe(400);
    });

    test('plan → read → ingredients → edit → eaten → copy week → clear', async ({ api, session }, info) => {
      const token = session.token;
      const from = projectDay(info, 1);
      const to = projectDay(info, 7);
      const range = `from=${from}&to=${to}`;
      const recipeId = await createRecipe(api, token, 'plan');
      try {
        const added = await api.post(
          MEAL_PLAN_ENTRIES_PATH,
          { date: projectDay(info, 2), meal: 'DINNER', recipeId, servings: 2 },
          token,
        );
        expect(added.status, JSON.stringify(added.decrypted)).toBe(201);

        const plan = await api.get(`${MEAL_PLAN_PATH}?${range}`, token);
        expect(plan.status).toBe(200);
        expect(dataOf(plan).from).toBe(from);
        const entry = entriesOf(plan).find((e) => recipeIdOf(e) === recipeId);
        expect(entry, 'the planned recipe is in its week').toBeTruthy();
        expect(entry!.meal).toBe('DINNER');

        const ingredients = await api.get(`${MEAL_PLAN_INGREDIENTS_PATH}?${range}`, token);
        expect(ingredients.status).toBe(200);
        expect(JSON.stringify(dataOf(ingredients).recipes)).toContain(recipeId);

        const edited = await api.patch(mealPlanEntryPath(entry!.id), { servings: 1.5, meal: 'LUNCH' }, token);
        expect(edited.status, JSON.stringify(edited.decrypted)).toBe(200);

        const eaten = await api.post(mealPlanEatenPath(entry!.id), {}, token);
        expect(eaten.status, JSON.stringify(eaten.decrypted)).toBe(200);
        const uneaten = await api.del(mealPlanEatenPath(entry!.id), token);
        expect(uneaten.status, JSON.stringify(uneaten.decrypted)).toBe(200);

        const copied = await api.post(MEAL_PLAN_COPY_PATH, { fromWeekStart: from, toWeekStart: projectDay(info, 8) }, token);
        expect(copied.status, JSON.stringify(copied.decrypted)).toBe(200);
        const nextWeek = await api.get(`${MEAL_PLAN_PATH}?from=${projectDay(info, 8)}&to=${projectDay(info, 14)}`, token);
        expect(entriesOf(nextWeek).some((e) => recipeIdOf(e) === recipeId), 'the copy lands a week later').toBe(true);

        const cleared = await api.del(`${MEAL_PLAN_PATH}?from=${from}&to=${projectDay(info, 14)}`, token);
        expect(cleared.status).toBe(204);
        const after = await api.get(`${MEAL_PLAN_PATH}?from=${from}&to=${projectDay(info, 14)}`, token);
        expect(entriesOf(after)).toHaveLength(0);
      } finally {
        await quietly(() => api.del(`${MEAL_PLAN_PATH}?from=${from}&to=${projectDay(info, 14)}`, token));
        await deleteRecipe(api, token, recipeId);
      }
    });
  });
});
