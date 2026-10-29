// The narrow viewer layout (FR-58): on a narrow viewport, the exported
// viewer, and only the viewer, shows the stage over the whole viewport, with
// the "In view" panel and the legend as overlay panels opened from a compact
// toggle bar, one at a time. The layout itself is one media block at the end
// of the stylesheet, on the same query as here; this module only runs while
// the query matches, so that above it the viewer behaves as on the desktop.
//
// The overlays follow the card's pattern: a data-state of open or closed,
// inert while closed, the toggle's aria-expanded, focus moved into the
// overlay on opening and returned to its toggle on closing; Escape and a tap
// outside close the open overlay. The motion is in the stylesheet, with its
// reduced-motion opt-out.

// The narrow viewport: narrower than 56 rem (896 pixels, so that phones and
// tablets in portrait are included), or a low landscape touch screen (a
// phone turned sideways, up to 30 rem, 480 pixels, high).
export const NARROW_QUERY = '(max-width: 56rem), (orientation: landscape) and (max-height: 30rem) and (pointer: coarse)';

export interface Overlay {
  toggle: HTMLButtonElement;
  panel: HTMLElement;
}

export interface NarrowViewerHooks {
  // Closes the card, so that an overlay and the card do not cover each
  // other.
  closeCard: () => void;
  // Lays the viewer out again after a change of mode.
  render: () => void;
  // Refits the view to the stage's new size, so that the view and "In view"
  // do not go stale.
  refit: () => void;
}

export class NarrowViewer {
  private openPanel: Overlay | null = null;

  constructor(
    private readonly query: MediaQueryList,
    private readonly overlays: Overlay[],
    private readonly hooks: NarrowViewerHooks,
  ) {
    for (const overlay of overlays) {
      overlay.toggle.addEventListener('click', () => {
        if (!this.active()) return;
        if (this.openPanel === overlay) this.close();
        else this.open(overlay);
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openPanel) {
        e.preventDefault();
        this.close();
      }
    });
    // A tap outside the open overlay and its toggle closes it.
    document.addEventListener(
      'pointerdown',
      (e) => {
        const open = this.openPanel;
        const target = e.target as Node | null;
        if (!open || !target) return;
        if (open.panel.contains(target) || open.toggle.contains(target)) return;
        this.close({ returnFocus: false });
      },
      true,
    );
    query.addEventListener('change', () => this.apply(false));
    // A resize or a change of orientation refits the view, in the narrow
    // layout only: above the threshold the handler returns at once, so that
    // the desktop viewer behaves as before.
    const refit = () => {
      if (this.active()) this.hooks.refit();
    };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    this.apply(true);
  }

  // Whether the narrow layout is in force.
  active(): boolean {
    return this.query.matches;
  }

  isOpen(panel: HTMLElement): boolean {
    return this.openPanel?.panel === panel;
  }

  open(overlay: Overlay): void {
    if (this.openPanel && this.openPanel !== overlay) this.close({ returnFocus: false });
    this.hooks.closeCard();
    this.openPanel = overlay;
    this.setState(overlay, true);
    overlay.panel.focus({ preventScroll: true });
  }

  close(options: { returnFocus?: boolean } = {}): void {
    const overlay = this.openPanel;
    if (!overlay) return;
    const hadFocus = overlay.panel.contains(document.activeElement);
    this.openPanel = null;
    this.setState(overlay, false);
    // Focus returns to the toggle the overlay was opened from (on a tap
    // outside, only if it was inside the overlay).
    if (hadFocus || options.returnFocus !== false) overlay.toggle.focus({ preventScroll: true });
  }

  private setState(overlay: Overlay, open: boolean): void {
    overlay.panel.dataset.state = open ? 'open' : 'closed';
    overlay.panel.inert = !open;
    if (open) overlay.panel.removeAttribute('inert');
    else overlay.panel.setAttribute('inert', '');
    overlay.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // Enters or leaves the narrow layout: inside it, the overlays start
  // closed; outside it, nothing of it remains on the panels and toggles.
  private apply(initial: boolean): void {
    this.openPanel = null;
    for (const overlay of this.overlays) {
      if (this.active()) {
        overlay.panel.tabIndex = -1;
        this.setState(overlay, false);
      } else {
        delete overlay.panel.dataset.state;
        overlay.panel.inert = false;
        overlay.panel.removeAttribute('inert');
        overlay.panel.removeAttribute('tabindex');
        overlay.toggle.removeAttribute('aria-expanded');
      }
    }
    this.hooks.render();
    // Entering the narrow layout later changes the stage's size; on opening,
    // the viewer keeps the view the file carries (FR-38).
    if (this.active() && !initial) this.hooks.refit();
  }
}
