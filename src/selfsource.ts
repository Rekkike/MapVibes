// The application's own page, as delivered (FR-11). The single-file build is
// one HTML document with the stylesheet and the application script inline;
// the export embeds a data island into a copy of exactly that document. The
// copy is taken when this module is evaluated: module scripts run once the
// document is parsed and before the application starts (DOMContentLoaded),
// so the copy holds the page before the application has changed anything.
// When the script is not inline (the development server), there is no
// single-file page to copy and the export is unavailable.

function capture(): string | null {
  if (typeof document === 'undefined') return null;
  const inline = [...document.querySelectorAll('script[type="module"]')].some((s) => !s.hasAttribute('src') && (s.textContent ?? '').trim() !== '');
  if (!inline) return null;
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

const page = capture();

export function selfPage(): string | null {
  return page;
}
