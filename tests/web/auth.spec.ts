import { test, expect } from '@playwright/test';
import { Recipely } from '../../helpers/recipely';
import { HAS_TEST_ACCOUNT, TEST_EMAIL, TEST_PASSWORD } from '../../helpers/config';

test.describe('Web · authentication', () => {
  let app: Recipely;

  test.beforeEach(async ({ page }) => {
    app = new Recipely(page);
    await app.goto();
  });

  test('empty fields do not submit (stays on login, no error)', async ({ page }) => {
    // The button is disabled while a field is empty; a press (forced past
    // Playwright's enabled-wait) must do nothing — no submit, no error banner.
    await app.signInButton.click({ force: true });
    await expect(app.emailInput).toBeVisible();
    await expect(page.getByText(/Invalid email or password/i)).toHaveCount(0);
  });

  test('invalid credentials surface an inline error', async ({ page }) => {
    // The deployed web bundle carries the real AES key, so this performs a real
    // (failing) login round-trip against the backend.
    await app.signIn(`nobody+${Date.now()}@recipely.invalid`, 'definitely-wrong');
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test('valid credentials sign in and leave the login screen', async ({ page }) => {
    test.skip(!HAS_TEST_ACCOUNT, 'Set RECIPELY_TEST_EMAIL / RECIPELY_TEST_PASSWORD to run.');
    // Retries the submit on a transient production "Request timed out" banner so
    // the assertion below reflects auth, not a one-off slow round-trip.
    await app.signInUntilHome(TEST_EMAIL, TEST_PASSWORD);
    // On success the screen redirects to /recipes; the email field disappears.
    await expect(app.emailInput).toHaveCount(0);
    await expect(page).toHaveURL(/recipes/i, { timeout: 20_000 });
  });
});
