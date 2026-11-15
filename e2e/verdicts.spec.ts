import { expect, test, type Page } from '@playwright/test';
import { boot } from './gate';
import { expectVerdict, readClaim, unmarked } from './verdict-audit';

/**
 * §4.1c verdict suite. Every mutation in mutations/registry.json forces one of
 * these verdicts false; mutations/run.mjs confirms each kill. The expectations
 * here are LITERALS derived from the brief and the protocol, never read off the
 * page under test — so a mutation that corrupts the mechanism makes the rendered
 * value disagree with the pinned one, and the owning test goes red.
 */
async function openTab(page: Page, id: string): Promise<void> {
  await page.locator(`#tab-${id}`).click();
  await expect(page.locator(`#panel-${id}`)).toBeVisible();
}

test.describe('rendered verdicts', () => {
  test('exhibit 1 Row 3 renders an HB+ check that passes', async ({ page }) => {
    // Row 3: a·x = 0, b·y = 1, ν = 0 → reply 1, reader check a·x ⊕ b·y = 1 = z, PASSES.
    // Mutation hbplus-drop-by (reader ignores b·y) makes the check read a·x = 0 ≠ 1 → fail.
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Row 3' }).click();
    await expectVerdict(page, 'round-hbp-check', { text: 'PASSES', tone: 'pass' });
  });

  test('a noiseless session at t = 0 is ACCEPTED', async ({ page }) => {
    // Mutation reader-strict-threshold (≤ t → < t) rejects a zero-failure session at t = 0.
    await boot(page, 'dark');
    await openTab(page, 'auth');
    await page.fill('#auth-k', '8');
    await page.fill('#auth-r', '6');
    await page.fill('#auth-eta', '0');
    await page.fill('#auth-t', '0');
    await page.getByRole('button', { name: 'Run authentication' }).click();
    await expectVerdict(page, 'auth-verdict', { text: 'ACCEPTED', tone: 'pass' });
  });

  test('the exact false-reject rate is 0.4403 at r = 80, t = 20', async ({ page }) => {
    // Independent value from the brief's acceptance table B. Mutation pfr-off-by-one changes it.
    await boot(page, 'dark');
    await openTab(page, 'auth');
    await page.getByRole('button', { name: 'Run authentication' }).click();
    const c = await readClaim(page, 'pfr-exact');
    expect(c.value, 'exact P_FR at r=80,t=20,η=1/4 is 0.4403 (brief acceptance B)').toBe('0.4403');
  });

  test('the observed false-reject frequency is substantial at the published threshold', async ({ page }) => {
    // At η=0.25, t=20 an honest tag is rejected ~44% of the time. Mutation
    // tag-noise-zero forces noise to 0, so honest sessions never reject → 0.
    await boot(page, 'dark');
    await openTab(page, 'auth');
    await page.getByRole('button', { name: 'Run authentication' }).click();
    const c = await readClaim(page, 'pfr-observed');
    const observed = Number(c.value);
    expect(observed, 'observed honest-reject frequency should be well above 0 (true ~0.44)').toBeGreaterThan(0.2);
  });

  test('the chosen-challenge attack recovers and verifies x', async ({ page }) => {
    // Mutation gf2-skip-row-swap breaks the elimination (the seeded set needs swaps).
    await boot(page, 'dark');
    await openTab(page, 'breakhb');
    await expectVerdict(page, 'hb-recovery', { text: 'VERIFIED', tone: 'alarm' });
  });

  test('mitm recovers x exactly at the published size', async ({ page }) => {
    // Mutations mitm-no-delta and mitm-majority-vote both make the recovery wrong.
    test.setTimeout(180_000);
    await boot(page, 'dark');
    await openTab(page, 'mitm');
    await page.getByRole('button', { name: /Recover the rest of x/ }).click();
    await expectVerdict(page, 'mitm-x-recovered', { text: 'FULLY RECOVERED', tone: 'alarm' });
  });

  test('the false tag recovers y exactly once x is known', async ({ page }) => {
    // Mutation falsetag-noisy-reply corrupts the false tag's replies → y wrong.
    test.setTimeout(180_000);
    await boot(page, 'dark');
    await openTab(page, 'mitm');
    await page.getByRole('button', { name: /Recover the rest of x/ }).click();
    await expect(page.locator('[data-verdict="mitm-x-recovered"]')).toHaveAttribute('data-tone', 'alarm', { timeout: 120_000 });
    await page.getByRole('button', { name: /Recover y with a false tag/ }).click();
    await expectVerdict(page, 'falsetag-y', { text: 'FULLY RECOVERED', tone: 'alarm' });
  });

  test('no verdict or measurement is rendered outside a marker', async ({ page }) => {
    await boot(page, 'dark');
    // drive one verdict into view so the scan has something to find if a bare one exists
    await page.getByRole('button', { name: 'Row 3' }).click();
    const stray = await unmarked(page);
    expect(stray, `every verdict and measurement must carry data-verdict/data-claim; found: ${stray.join(' | ')}`).toEqual([]);
  });
});
