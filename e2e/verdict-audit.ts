import { expect, test, type Page } from '@playwright/test';
import { record, specPath } from './observations';

/**
 * Shared verdict/measurement helpers for the §4.1b claims suite and the §4.1c
 * verdict suite. Every recorded kill goes through one of these, and each records
 * the (test title, marker) pair it EXECUTES so global-teardown can prove the
 * kill actually ran rather than merely being mentioned in spec source.
 *
 * A verdict marker carries data-verdict + data-tone; this asserts the marker is
 * rendered exactly once, contains the expected text, and carries the expected
 * tone — AND that the stylesheet actually paints that tone, proven by flipping
 * the attribute in place and reading the computed colour back. An attribute
 * nothing paints is a state a reader cannot see.
 */
test.afterEach(async ({}, info) => {
  record({ kind: 'ran', test: info.title, spec: specPath(info.file), attempt: info.retry, status: info.status ?? 'unknown' });
});

function observe(helper: 'expectVerdict' | 'expectNoVerdict' | 'readClaim', marker: string): void {
  const info = test.info();
  record({ kind: 'asserted', test: info.title, spec: specPath(info.file), attempt: info.retry, helper, marker });
}

export async function expectVerdict(
  page: Page,
  id: string,
  expected: { readonly text: string | RegExp; readonly tone: 'pass' | 'fail' | 'alarm' }
): Promise<void> {
  observe('expectVerdict', id);
  const marker = page.locator(`[data-verdict="${id}"]`);
  await expect(marker, `verdict marker "${id}" is not rendered exactly once`).toHaveCount(1);
  await expect(marker, `verdict marker "${id}" rendered the wrong text`).toContainText(expected.text);
  await expect(marker, `verdict marker "${id}" is in the wrong tone`).toHaveAttribute('data-tone', expected.tone);

  const painted = await marker.evaluate((element) => {
    const read = (): string => {
      const s = getComputedStyle(element);
      return `${s.backgroundColor}|${s.borderColor}`;
    };
    const original = element.getAttribute('data-tone');
    const before = read();
    element.setAttribute('data-tone', original === 'alarm' ? 'pass' : 'alarm');
    const after = read();
    if (original === null) element.removeAttribute('data-tone');
    else element.setAttribute('data-tone', original);
    return before !== after;
  });
  expect(painted, `verdict marker "${id}" has a data-tone the stylesheet does not paint, so its state is invisible to a reader`).toBe(true);
}

export async function expectNoVerdict(page: Page, id: string): Promise<void> {
  observe('expectNoVerdict', id);
  await expect(page.locator(`[data-verdict="${id}"]`), `verdict marker "${id}" should be absent`).toHaveCount(0);
}

/** Read a measurement marker's displayed value so the caller can compare it with an INDEPENDENT expectation. */
export async function readClaim(page: Page, id: string): Promise<{ value: string; text: string }> {
  observe('readClaim', id);
  const marker = page.locator(`[data-claim="${id}"]`);
  await expect(marker, `claim marker "${id}" is not rendered exactly once`).toHaveCount(1);
  return marker.evaluate((element) => ({
    value: element.getAttribute('data-value') ?? '',
    text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
  }));
}

/** Every verdict or measurement rendered OUTSIDE a marker, read from each element's own text. */
export async function unmarked(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const WORDS = ['ACCEPTED', 'REJECTED', 'RECOVERED', 'RECOVERY WRONG', 'KEY FOUND', 'IMPERSONATED', 'HOLDS', 'LEAKED', 'PASSES', 'FAILS'];
    const out: string[] = [];
    const ownText = (el: Element): string =>
      Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join(' ').trim();
    // (a) verdict STYLING outside a marker
    for (const el of Array.from(document.querySelectorAll('.verdict'))) {
      if (el.closest('[data-verdict]')) continue;
      out.push(`styling: ${(el.textContent ?? '').trim().slice(0, 80)}`);
    }
    // (b) verdict WORDS outside a marker, visible
    for (const el of Array.from(document.querySelectorAll('main *'))) {
      if (el.closest('[data-verdict]') || el.closest('[data-claim]')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || el.closest('[hidden]')) continue;
      const t = ownText(el);
      if (!t) continue;
      const hit = WORDS.find((w) => t.includes(w));
      if (hit) out.push(`words: ${hit} :: ${t.slice(0, 80)}`);
    }
    return Array.from(new Set(out));
  });
}
