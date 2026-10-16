import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import { CAN_RUN_AUTHED, SESSION_FILE, login } from './helpers/auth';

/**
 * Logs the test account in once per run and leaves the session where every
 * worker's `session` fixture reads it (helpers/auth.ts). Without this each
 * worker logged in at the same instant and the slow, hashed logins timed out.
 * A stale file from an earlier run is removed first, so a failed login here
 * falls back to per-worker logins instead of a dead token.
 */
export default async function globalSetup(): Promise<void> {
  fs.rmSync(SESSION_FILE, { force: true });
  if (!CAN_RUN_AUTHED) return;
  const context = await request.newContext();
  try {
    const session = await login(context);
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session));
  } catch (err) {
    console.warn(`[global-setup] shared login failed, workers will log in themselves: ${String(err)}`);
  } finally {
    await context.dispose();
  }
}
