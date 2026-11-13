// Switching between the segments (List, Map, Presentation).
import { showSegment, type Segment } from './segments';
import { state } from './appstate';
import { renderDetailsPanel } from './detailspanel';
import { drawingTools, setDrawingTool } from './annotationpanel';
import { mapView, renderMapItems, stopPlacing } from './mapstage';
import { presentationView } from './presentationstage';
import { appNarrow, narrowApplication, refitNarrowStages } from './narrowlayout';
import { layoutShell } from './shell';

export function setSegment(segment: Segment): void {
  // Drawing happens in the Map segment only (FR-47).
  if (segment !== 'map' && drawingTools && drawingTools.tool !== 'select') {
    setDrawingTool('select');
  }
  state.segment = segment;
  // An overlay of the narrow layout belongs to the segment it was opened in,
  // and so does a placement waiting for a tap.
  appNarrow?.close({ returnFocus: false });
  if (segment !== 'map') {
    stopPlacing();
  }
  showSegment(document, segment);
  if (segment === 'map') {
    mapView?.shown();
  }
  if (segment === 'presentation') {
    presentationView?.shown();
  }
  // A stage that changed size while hidden is refitted once shown (FR-71).
  if (narrowApplication()) {
    refitNarrowStages();
  }
  // Panels depend on the stage size, which is known only while it is shown.
  renderMapItems();
  renderDetailsPanel();
  // The short class's rail carries the shown segment's controls (v2.1.0).
  layoutShell();
}
