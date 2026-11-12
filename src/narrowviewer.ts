// The narrow layout's overlays (FR-58, FR-72): on a narrow viewport, the
// exported viewer shows the stage over the whole viewport, with the "In
// view" panel and the legend as overlay panels opened from a compact toggle
// bar, one at a time; the application does the same with the panels of its
// Map and Presentation segments, in an instance of its own. The layout
// itself is in two media blocks at the end of the stylesheet, on the same
// query as here, one for the viewer and one for the application; this module
// only runs while the query matches (and, for an instance gated on a mode,
// while that mode is in force), so that above it everything behaves as on
// the desktop.
//
// The overlays follow the card's pattern: a data-state of open or closed,
// inert while closed, the toggle's aria-expanded, focus moved into the
// overlay on opening and returned to its toggle on closing; Escape and a tap
// outside close the open overlay. The motion is in the stylesheet, with its
// reduced-motion opt-out.

// The narrow viewport (FR-58 as amended in v2.0.0): the compact class,
// narrower than 48 rem (768 pixels), or the short class, lower than 31.25 rem
// (500 pixels) whatever the width or the pointer. The medium, wide, and extra
// wide classes begin where it ends (FR-81).
export const NARROW_QUERY = '(max-width: 47.999rem), (max-height: 31.249rem)';
// Within those classes: the wide class begins at 75 rem (1,200 pixels); the
// items panel docks from 87.5 rem (1,400 pixels); the extra wide class begins
// at 120 rem (1,920 pixels).
export const WIDE_QUERY = '(min-width: 75rem)';
export const DOCK_QUERY = '(min-width: 87.5rem)';
export const XWIDE_QUERY = '(min-width: 120rem)';

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
  // Whether the instance's mode is in force (the application's instance
  // gives way to the viewer when a presentation is opened); always, where
  // absent.
  enabled?: () => boolean;
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
        if (!this.active()) {
          return;
        }
        if (this.openPanel === overlay) {
          this.close();
        } else {
          this.open(overlay);
        }
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
        if (!open || !target) {
          return;
        }
        if (open.panel.contains(target) || open.toggle.contains(target)) {
          return;
        }
        this.close({ returnFocus: false });
      },
      true,
    );
    query.addEventListener('change', () => this.apply(false));
    // A resize or a change of orientation refits the view, in the narrow
    // layout only: above the threshold the handler returns at once, so that
    // the desktop viewer behaves as before.
    const refit = () => {
      if (this.active()) {
        this.hooks.refit();
      }
    };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    this.apply(true);
  }

  // Whether the narrow layout is in force.
  active(): boolean {
    return this.query.matches && (this.hooks.enabled?.() ?? true);
  }

  // Lays the overlays out again after a change of the gate.
  refresh(): void {
    this.apply(false);
  }

  isOpen(panel: HTMLElement): boolean {
    return this.openPanel?.panel === panel;
  }

  open(overlay: Overlay): void {
    if (this.openPanel && this.openPanel !== overlay) {
      this.close({ returnFocus: false });
    }
    this.hooks.closeCard();
    this.openPanel = overlay;
    this.setState(overlay, true);
    overlay.panel.focus({ preventScroll: true });
  }

  close(options: { returnFocus?: boolean } = {}): void {
    const overlay = this.openPanel;
    if (!overlay) {
      return;
    }
    const hadFocus = overlay.panel.contains(document.activeElement);
    this.openPanel = null;
    this.setState(overlay, false);
    // Focus returns to the toggle the overlay was opened from (on a tap
    // outside, only if it was inside the overlay).
    if (hadFocus || options.returnFocus !== false) {
      overlay.toggle.focus({ preventScroll: true });
    }
  }

  private setState(overlay: Overlay, open: boolean): void {
    overlay.panel.dataset.state = open ? 'open' : 'closed';
    overlay.panel.inert = !open;
    if (open) {
      overlay.panel.removeAttribute('inert');
    } else {
      overlay.panel.setAttribute('inert', '');
    }
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
    if (this.active() && !initial) {
      this.hooks.refit();
    }
  }
}

// The six dialogs as overlays in the narrow layout (FR-71 and FR-72 as amended
// in v1.15.0): below the threshold the dialogs open over the stage instead of
// in the page flow -- three bottom sheets (fetch open map data, the PDF
// background chooser, export document) and three stacked pages (export
// presentation, comparison, activities), the stylesheet giving each its
// shape with the header and the actions pinned. One dialog is open at a
// time; focus moves into it on opening and returns to the opener on closing;
// Escape and a tap outside close it through its own close routine. Above the
// threshold the manager does nothing and the dialogs keep their page-flow
// shapes, so the application routes every showing and hiding of the six
// panels through it and lets the hidden class remain the dialogs' own flag.
export type DialogKind = 'sheet' | 'page';

export interface NarrowDialogSpec {
  id: string;
  kind: DialogKind;
  // The dialog's own close routine, called on Escape and a tap outside.
  close: () => void;
}

export class NarrowDialogs {
  private openId: string | null = null;
  private opener: HTMLElement | null = null;

  constructor(
    private readonly query: MediaQueryList,
    private readonly specs: NarrowDialogSpec[],
    private readonly hooks: { enabled?: () => boolean; render?: () => void },
  ) {
    // Escape closes the open dialog through its own close routine; the
    // panels' own handlers run first when the focus is inside them, and the
    // hidden check keeps the close single.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.active()) {
        return;
      }
      const id = this.openId;
      if (!id) {
        return;
      }
      const panel = document.getElementById(id);
      if (!panel || panel.classList.contains('hidden')) {
        return;
      }
      e.preventDefault();
      this.specs.find((s) => s.id === id)?.close();
    });
    // A tap outside the open dialog closes it.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.active()) {
          return;
        }
        const id = this.openId;
        if (!id) {
          return;
        }
        const panel = document.getElementById(id);
        if (!panel || panel.classList.contains('hidden')) {
          return;
        }
        const target = e.target as Node | null;
        if (!target || panel.contains(target)) {
          return;
        }
        this.specs.find((s) => s.id === id)?.close();
      },
      true,
    );
    query.addEventListener('change', () => this.apply());
    this.apply();
  }

  active(): boolean {
    return this.query.matches && (this.hooks.enabled?.() ?? true);
  }

  isOpen(id: string): boolean {
    return this.openId === id;
  }

  // The application shows a dialog (its hidden class is about to be
  // removed): in the narrow layout the dialog becomes the one open overlay
  // -- any other open dialog closes, focus moves into this one, and the
  // opener is remembered for the return.
  showing(id: string): void {
    if (!this.active()) {
      return;
    }
    if (this.openId && this.openId !== id) {
      this.specs.find((s) => s.id === this.openId)?.close();
    }
    const panel = document.getElementById(id);
    if (!panel) {
      return;
    }
    this.openId = id;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.dataset.state = 'open';
    panel.inert = false;
    panel.removeAttribute('inert');
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
  }

  // The application hides a dialog: the overlay state is cleared and focus
  // returns to the opener, if it was inside the dialog.
  hidden(id: string): void {
    const panel = document.getElementById(id);
    if (!panel) {
      return;
    }
    if (!this.active()) {
      delete panel.dataset.state;
      panel.inert = false;
      panel.removeAttribute('inert');
      panel.removeAttribute('tabindex');
      return;
    }
    const wasOpen = this.openId === id;
    if (wasOpen) {
      this.openId = null;
    }
    panel.dataset.state = 'closed';
    panel.inert = true;
    panel.setAttribute('inert', '');
    if (wasOpen) {
      const hadFocus = panel.contains(document.activeElement);
      const opener = this.opener;
      this.opener = null;
      panel.removeAttribute('tabindex');
      if (hadFocus && opener?.isConnected) {
        opener.focus({ preventScroll: true });
      }
    }
  }

  // Closes the open dialog, if any, through its own close routine.
  closeOpen(): void {
    const id = this.openId;
    if (!id) {
      return;
    }
    this.specs.find((s) => s.id === id)?.close();
  }

  // Enters or leaves the narrow layout: outside it nothing of the overlay
  // remains on the panels; entering it, a dialog already shown becomes the
  // open overlay.
  private apply(): void {
    for (const spec of this.specs) {
      const panel = document.getElementById(spec.id);
      if (!panel) {
        continue;
      }
      if (this.active()) {
        if (!panel.classList.contains('hidden')) {
          if (this.openId !== spec.id) {
            this.openId = spec.id;
          }
          panel.dataset.state = 'open';
          panel.inert = false;
          panel.removeAttribute('inert');
          panel.tabIndex = -1;
        } else {
          panel.dataset.state = 'closed';
          panel.inert = true;
          panel.setAttribute('inert', '');
        }
      } else {
        delete panel.dataset.state;
        panel.inert = false;
        panel.removeAttribute('inert');
        panel.removeAttribute('tabindex');
      }
    }
    this.hooks.render?.();
  }
}
