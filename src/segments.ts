// Segment navigation (FR-22). Segments are panels of one document: switching
// only changes which panel is shown, so all state and DOM of the other
// segments is retained and no work is lost by moving between them.

export type Segment = 'information' | 'map' | 'presentation';

export const SEGMENTS: Segment[] = ['information', 'map', 'presentation'];

export function isSegment(value: string | undefined): value is Segment {
  return value !== undefined && (SEGMENTS as string[]).includes(value);
}

export function showSegment(root: Document, segment: Segment): void {
  for (const s of SEGMENTS) {
    const active = s === segment;
    root.getElementById(`segment-${s}`)?.classList.toggle('hidden', !active);
    const tab = root.getElementById(`tab-${s}`);
    if (tab) {
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    }
  }
  root.documentElement.dataset.segment = segment;
}
