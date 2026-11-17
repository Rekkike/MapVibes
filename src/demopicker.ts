// The demo picker (v2.4.0): with two demos bundled, the start screen's
// "Load demo" button and the menu's "Load a demo…" open one dialog panel
// (the export and activity panels' pattern) listing the demos as radio
// options; Load loads the chosen demo through the same unsaved-changes
// confirm as before, Cancel closes without changing anything.
import { el, state } from './appstate';
import { strings } from './i18n';
import { showDialog, hideDialog } from './narrowlayout';
import { currentDemoId, loadDemo } from './demoload';
import { DEMO_IDS, type DemoId } from './demo';

function selectedDemo(): DemoId {
  for (const id of DEMO_IDS) {
    const radio = el<HTMLInputElement>(`demo-choice-${id}`);
    if (radio.checked) {
      return id;
    }
  }
  return 'parkland';
}

export function openDemoPicker(): void {
  const current = currentDemoId();
  // With no demo loaded, the markup's default (the parkland option) stands.
  if (current !== null) {
    for (const id of DEMO_IDS) {
      el<HTMLInputElement>(`demo-choice-${id}`).checked = current === id;
    }
  }
  showDialog('demo-panel');
  el('demo-panel').scrollTop = 0;
  el('demo-go').focus({ preventScroll: true });
}

export function closeDemoPicker(): void {
  hideDialog('demo-panel');
  el('load-demo').focus();
}

export function applyDemoPickerLabels(): void {
  const t = strings(state.prefs.lang);
  el('demo-heading').textContent = t.demoPickerTitle;
  el('demo-opt-parkland').textContent = t.demoOptionParkland;
  el('demo-opt-parkland-desc').textContent = t.demoOptionParklandDesc;
  el('demo-opt-helsingborg').textContent = t.demoOptionHelsingborg;
  el('demo-opt-helsingborg-desc').textContent = t.demoOptionHelsingborgDesc;
  el('demo-go').textContent = t.demoGo;
  el('demo-cancel').textContent = t.demoPickerCancel;
  el('demo-load-again').textContent = t.demoLoadAgain;
}

export function wireDemoPicker(): void {
  el('load-demo').addEventListener('click', () => openDemoPicker());
  el('demo-load-again').addEventListener('click', () => openDemoPicker());
  el('demo-cancel').addEventListener('click', () => closeDemoPicker());
  el('demo-go').addEventListener('click', () => {
    const id = selectedDemo();
    hideDialog('demo-panel');
    void loadDemo(id);
  });
}
