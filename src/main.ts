import './style.css';
import { renderByHand } from './ui/panel-byhand';
import { renderAuth } from './ui/panel-auth';
import { renderBreakHB } from './ui/panel-breakhb';
import { renderHBPlusStops } from './ui/panel-hbplus-stops';
import { renderMitm } from './ui/panel-mitm';
import { renderNegative } from './ui/panel-negative';
import { renderEavesdrop } from './ui/panel-eavesdrop';

type PanelKey = 'byhand' | 'auth' | 'breakhb' | 'hbplus' | 'mitm' | 'negative' | 'eavesdrop';

const renderers: Record<PanelKey, (root: HTMLElement) => void> = {
  byhand: renderByHand,
  auth: renderAuth,
  breakhb: renderBreakHB,
  hbplus: renderHBPlusStops,
  mitm: renderMitm,
  negative: renderNegative,
  eavesdrop: renderEavesdrop,
};

const rendered = new Set<PanelKey>();

function panelEl(key: PanelKey): HTMLElement {
  return document.getElementById(`panel-${key}`) as HTMLElement;
}

function ensureRendered(key: PanelKey): void {
  if (rendered.has(key)) return;
  renderers[key](panelEl(key));
  rendered.add(key);
}

function selectTab(key: PanelKey): void {
  for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'))) {
    const active = tab.dataset.panel === key;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.classList.toggle('active', active);
    panelEl(tab.dataset.panel as PanelKey).hidden = !active;
  }
  ensureRendered(key);
}

function wireTabs(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.panel as PanelKey));
    tab.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next >= 0) {
        e.preventDefault();
        tabs[next].focus();
        selectTab(tabs[next].dataset.panel as PanelKey);
      }
    });
  });
}

wireTabs();
selectTab('byhand');
