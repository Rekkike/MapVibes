// The quiet chrome (FR-37 and FR-38 as amended in v2.1.0): on the
// Presentation segment's stage and in the exported viewer, the floating
// chrome withdraws when idle and returns on interaction. The owner's ruling:
// four seconds of stillness — no pointer movement, no touch, no key — and
// the chrome withdraws; any interaction returns it. There is no fade: the
// state toggles instantly, on the same timer, with or without the
// reduced-motion preference (the stylesheet carries no transition for it).
//
// The chrome does not withdraw while a panel, a card, or a dialog is open:
// the timer runs on and the chrome stays.

import { el, state } from './appstate';

// The ruled idle delay (the owner's ruling; the annex was silent on it).
export const IDLE_MS = 4000;

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

// Whether the quiet chrome applies right now: the Presentation segment of
// the application, or the exported viewer, in any class.
function onPresentationStage(): boolean {
  return document.documentElement.dataset.mode === 'viewer' || state.segment === 'presentation';
}

// Whether anything that must keep the chrome visible is open.
function anythingOpen(): boolean {
  if (document.querySelector('#segment-presentation [data-state="open"]')) {
    return true;
  }
  if (el('presentation-card').dataset.state === 'open') {
    return true;
  }
  return [...document.querySelectorAll<HTMLElement>('#fetch-panel, #pdf-panel, #document-panel, #export-panel, #compare-panel, #activity-panel')].some(
    (d) => !d.classList.contains('hidden'),
  );
}

function withdraw(): void {
  timer = null;
  if (!onPresentationStage() || anythingOpen()) {
    wake();
    return;
  }
  document.documentElement.dataset.idle = 'true';
}

function wake(): void {
  if (timer !== null) {
    clearTimeout(timer);
  }
  delete document.documentElement.dataset.idle;
  timer = setTimeout(withdraw, IDLE_MS);
}

// Starts the idle timer. Called once at the start, in the application and in
// the exported viewer alike.
export function startQuietChrome(): void {
  if (started) {
    return;
  }
  started = true;
  for (const type of ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel']) {
    window.addEventListener(type, wake, { passive: true });
  }
  wake();
}
