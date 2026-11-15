/**
 * Tiny DOM helpers shared by every panel. The two that matter for the §4.1c
 * gate are `verdict` and `claim`: every headline the page renders as a VERDICT
 * carries `data-verdict="<id>"` and a `data-tone`, and every MEASUREMENT a
 * learner is invited to check carries `data-claim="<id>"` and a `data-value`.
 * A verdict or a number painted outside a marker is flagged by the gate, so
 * nothing on the page states an outcome without one.
 *
 * Colour tracks SYSTEM INTEGRITY, never the raw return value (invariant 7). An
 * accepted session that leaked a key bit is `tone: 'alarm'`, not a green pass.
 */

type Tone = 'pass' | 'fail' | 'alarm';
type Child = Node | string | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean> = {},
  children: Child[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

const ICON: Record<Tone, string> = { pass: '✓', fail: '✕', alarm: '⚠' };

/** A verdict banner: icon + text + colour, keyed by integrity tone. */
export function verdict(id: string, tone: Tone, text: string): HTMLElement {
  return el('div', { class: 'verdict', 'data-verdict': id, 'data-tone': tone, role: 'status', 'aria-live': 'polite' }, [
    el('span', { class: 'verdict-icon', 'aria-hidden': 'true', text: ICON[tone] }),
    el('span', { class: 'verdict-text', text }),
  ]);
}

/** A measurement the learner can check: its number carries the marker and its raw value. */
export function claim(id: string, value: string, label?: string, sub?: string): HTMLElement {
  const parts: Child[] = [];
  if (label) parts.push(el('span', { class: 'stat-label', text: label }));
  parts.push(el('span', { class: 'stat-value', 'data-claim': id, 'data-value': value, text: value }));
  if (sub) parts.push(el('span', { class: 'stat-sub', text: sub }));
  return el('div', { class: 'stat' }, parts);
}

export function field(label: string, value: string, mono = true): HTMLElement {
  return el('div', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }),
    el('div', { class: mono ? 'field-value' : 'field-value', text: value }),
  ]);
}

export function intro(heading: string, lead: string, rest: string[] = []): HTMLElement {
  return el('div', { class: 'panel-intro' }, [
    el('h2', { text: heading }),
    el('p', { class: 'lead', text: lead }),
    ...rest.map((p) => el('p', { html: p })),
  ]);
}

/** The "what this isn't" one-liner each non-goal gets. */
export function notThis(text: string): HTMLElement {
  return el('p', { class: 'not-this', text });
}

export function callout(kind: 'info' | 'danger' | 'caveat', html: string): HTMLElement {
  return el('div', { class: `callout callout-${kind}`, html });
}

/** Truncate a long bit string for display: first/last run with an ellipsis. */
export function ellipsizeBits(s: string, head = 12, tail = 12): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)} (${s.length} bits)`;
}
