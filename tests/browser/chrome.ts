import type { Page } from 'playwright';

// Reaching the controls that the layout of the medium class and above keeps
// behind the bar's menus (FR-81): the language and the theme are in the
// Menu, and the three exports are in the Export menu. In the compact and
// short classes and in the exported viewer these controls are where they
// were, so each step uses the control directly where it is shown and opens
// its menu first where it is not.

// Chooses a value in the language or the theme select.
export async function setSelect(page: Page, id: 'select-language' | 'select-theme', value: string): Promise<void> {
  if (await page.isVisible(`#${id}`)) {
    await page.selectOption(`#${id}`, value);
    return;
  }
  if (await page.isVisible('#menu-toggle')) {
    await page.click('#menu-toggle');
    await page.selectOption(`#${id}`, value);
    await page.keyboard.press('Escape');
    return;
  }
  // Neither is shown (a page still loading its layout): the select is set as
  // its change handler expects.
  await page.evaluate(
    ([select, chosen]) => {
      const node = document.getElementById(select) as HTMLSelectElement;
      node.value = chosen;
      node.dispatchEvent(new Event('change'));
    },
    [id, value],
  );
}

// Presses one of the three export actions.
export async function pressExport(page: Page, id: 'export-open' | 'pdf-open' | 'pptx-open'): Promise<void> {
  if (!(await page.isVisible(`#${id}`))) {
    await page.click('#bar-export');
  }
  await page.click(`#${id}`);
}

// Shows a panel that the layout keeps folded (the visibility list of the
// Presentation segment), where its control is shown and says it is folded.
export async function showPanel(page: Page, toggle: 'toggle-visibility' | 'toggle-items' | 'toggle-glance' | 'toggle-map-glance'): Promise<void> {
  const folded = await page.evaluate((id) => {
    const node = document.getElementById(id);
    return (
      node !== null &&
      document.documentElement.dataset.layout !== 'compact' &&
      document.documentElement.dataset.layout !== 'short' &&
      node.getAttribute('aria-expanded') === 'false'
    );
  }, toggle);
  if (folded && (await page.isVisible(`#${toggle}`))) {
    await page.click(`#${toggle}`);
  }
}

// Folds the Map segment's legend where it is open (from 768 pixels upward it
// is open by default, floating over the stage's lower left), so that a step
// drawing on that part of the stage reaches the map.
export async function foldLegend(page: Page): Promise<void> {
  if ((await page.getAttribute('#toggle-map-legend', 'aria-expanded')) === 'true' && (await page.isVisible('#toggle-map-legend'))) {
    await page.click('#toggle-map-legend');
  }
}
