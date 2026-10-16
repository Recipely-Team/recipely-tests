import type { TestInfo } from '@playwright/test';

/**
 * Calendar days for the specs that write to dated, account-wide stores (meal
 * plan, diary). The two backend projects run the same spec in parallel on the
 * same test account, so each project gets its OWN far-future week: one project
 * can clear or copy its range without touching rows the other is asserting on,
 * and no real day of the account is ever written.
 */
const BASE_YEAR = 2031;
const PROJECT_MONTH: Record<string, number> = { 'backend-direct': 3, 'backend-mobile': 5 };

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` for `day` of this project's month. */
export function projectDay(info: TestInfo, day: number): string {
  const month = PROJECT_MONTH[info.project.name] ?? 7;
  return `${BASE_YEAR}-${pad(month)}-${pad(day)}`;
}

/** `YYYY-MM` of this project's month. */
export function projectMonth(info: TestInfo): string {
  return projectDay(info, 1).slice(0, 7);
}
