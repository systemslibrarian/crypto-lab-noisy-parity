import { expect, test, type Page } from '@playwright/test';
import { boot } from './gate';
import { readClaim } from './verdict-audit';

/**
 * §4.1b claims suite — does the page tell the truth. Each check compares two
 * values the page itself printed, or re-derives a displayed claim from its
 * on-screen inputs by a route the source does not take. §4.1d's negative claim
 * and its two bite assertions live here too.
 */
async function openTab(page: Page, id: string): Promise<void> {
  await page.locator(`#tab-${id}`).click();
  await expect(page.locator(`#panel-${id}`)).toBeVisible();
}

/** Independent binomial upper tail P[Bin(n,p) > t] as a float — a different route than rates.ts. */
function binomTailAbove(n: number, t: number, p: number): number {
  let total = 0;
  // term_i = C(n,i) p^i (1-p)^(n-i), by a multiplicative recurrence
  let term = Math.pow(1 - p, n);
  for (let i = 0; i <= n; i++) {
    if (i > t) total += term;
    term *= ((n - i) / (i + 1)) * (p / (1 - p));
  }
  return total;
}

test.describe('displayed claims are true', () => {
  test('the exact P_FR equals an independent binomial tail of the r, t, η on screen', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, 'auth');
    await page.getByRole('button', { name: 'Run authentication' }).click();
    const shown = await readClaim(page, 'pfr-exact');
    // Re-derive from the defaults the page carries (r=80, t=20, η=0.25), rounded to the display form.
    const independent = binomTailAbove(80, 20, 0.25);
    // The page prints the exact rational rounded to 4 significant figures; the
    // independent float tail must agree to that display precision.
    expect(Number(shown.value)).toBeCloseTo(independent, 3);
    expect(shown.value).toBe(independent.toPrecision(4));
  });

  test('the error count equals the number of failed round cells', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, 'auth');
    await page.getByRole('button', { name: 'Run authentication' }).click();
    const shown = Number((await readClaim(page, 'error-count')).value);
    const failedCells = await page.locator('#panel-auth .round-cell.round-fail').count();
    expect(shown).toBe(failedCells);
  });

  test('the attacker bit count equals the number of filled key cells', async ({ page }) => {
    test.setTimeout(180_000);
    await boot(page, 'dark');
    await openTab(page, 'mitm');
    await page.getByRole('button', { name: /Tamper with one bit/ }).click();
    const bits = Number((await readClaim(page, 'mitm-bits')).value);
    const filled = await page.locator('#panel-mitm .keybit-known').count();
    expect(bits).toBe(filled);
    expect(bits).toBe(1);
  });

  test('a fully recovered key shows no wrong cells when the verdict says it matches', async ({ page }) => {
    test.setTimeout(180_000);
    await boot(page, 'dark');
    await openTab(page, 'mitm');
    await page.getByRole('button', { name: /Recover the rest of x/ }).click();
    await expect(page.locator('[data-verdict="mitm-x-recovered"]')).toHaveAttribute('data-tone', 'alarm', { timeout: 120_000 });
    // The alarm verdict claims every bit matches; the graded key must carry no wrong cells.
    await expect(page.locator('#panel-mitm .keybit-wrong')).toHaveCount(0);
    await expect(page.locator('#panel-mitm .keybit-correct')).toHaveCount(224);
  });

  test('changing a parameter retires the stale verdict; re-running the same inputs does not', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, 'auth');
    await page.getByRole('button', { name: 'Run authentication' }).click();
    await expect(page.locator('[data-verdict="auth-verdict"]')).toBeVisible();
    // Retirement on change.
    await page.fill('#auth-t', '26');
    await expect(page.locator('#auth-out .busy')).toBeVisible();
    await expect(page.locator('[data-verdict="auth-verdict"]')).toHaveCount(0);
    // No-op guard: running again (no input change between runs) yields a fresh verdict, not a retirement.
    await page.getByRole('button', { name: 'Run authentication' }).click();
    await expect(page.locator('[data-verdict="auth-verdict"]')).toBeVisible();
    await page.getByRole('button', { name: 'Run authentication' }).click();
    await expect(page.locator('[data-verdict="auth-verdict"]')).toBeVisible();
    await expect(page.locator('#auth-out .busy')).toHaveCount(0);
  });

  test('the six non-arrival panels ship hidden and empty ([hidden] probe)', async ({ page }) => {
    await boot(page, 'dark');
    for (const id of ['auth', 'breakhb', 'hbplus', 'mitm', 'negative', 'eavesdrop']) {
      await expect(page.locator(`#panel-${id}`)).toBeHidden();
      await expect(page.locator(`#panel-${id}`)).toBeEmpty();
    }
  });
});

test.describe('negative claim (§4.1d)', () => {
  test('HB+ proof does not cover the man-in-the-middle, shown as a live fixture', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, 'negative');

    // Assertion 3 (always visible): the negative-claim sentence is on screen, not behind a disclosure.
    // Deleting the sentence from the page makes THIS fail — the bite.
    await expect(page.locator('[data-negative-claim="true"]')).toBeVisible();
    await expect(page.locator('[data-negative-claim="true"]')).toContainText('does not cover an adversary who alters the reader');

    // Assertion 1: reach the fixture through the UI.
    await page.getByRole('button', { name: /Drive the fixture/ }).click();
    await expect(page.locator('[data-verdict="negative-fixture"]')).toBeVisible();

    // Assertion 2: in that state EVERY rendered verdict reports success — the
    // fixture verdict reads AUTHENTICATED, and no failing verdict is present.
    // Breaking a check inside the fixture (so it rejected) makes THIS fail — the bite.
    await expect(page.locator('[data-verdict="negative-fixture"]')).toHaveAttribute('data-tone', 'alarm');
    await expect(page.locator('[data-verdict="negative-fixture"]')).toContainText('AUTHENTICATED');
    await expect(page.locator('#panel-negative [data-tone="fail"]')).toHaveCount(0);

    // Assertion 3 (in the fixture state): the limitation is tied to the fixture and visible.
    await expect(page.locator('[data-fixture-claim="true"]')).toBeVisible();
    await expect(page.locator('[data-fixture-claim="true"]')).toContainText('no failure code');
  });
});
