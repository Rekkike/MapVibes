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

// Whether the environment the module runs in is still alive. In the
// application the document outlives the module; in a test run the jsdom
// environment is torn down after the last test, and a timer firing then
// must not read a dead document.
function environmentAlive(): boolean {
  return typeof document !== 'undefined';
}

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
  return [
    ...document.querySelectorAll<HTMLElement>('#fetch-panel, #pdf-panel, #document-panel, #export-panel, #compare-panel, #activity-panel, #demo-panel'),
  ].some((d) => !d.classList.contains('hidden'));
}

function withdraw(): void {
  timer = null;
  if (!environmentAlive()) {
    return;
  }
  if (!onPresentationStage() || anythingOpen()) {
    wake();
    return;
  }
  document.documentElement.dataset.idle = 'true';
}

function wake(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!environmentAlive()) {
    return;
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
  // In the capture phase, so that every interaction counts wherever it lands:
  // the schedule views stop the pointer and the wheel at their root, and the
  // card stops the pointer, before a bubbling listener on the window could
  // see them (the release workflow's run 72 of v2.7.0).
  for (const type of ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel']) {
    window.addEventListener(type, wake, { passive: true, capture: true });
  }
  wake();
}
