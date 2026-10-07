import type { Lang } from './i18n';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Preferences {
  lang: Lang;
  theme: ThemeChoice;
}

export const DEFAULT_PREFERENCES: Preferences = { lang: 'en', theme: 'system' };

const STORAGE_KEY = 'mapvibes.preferences';

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = 'mapvibes.probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadPreferences(): Preferences {
  const s = storage();
  if (!s) return { ...DEFAULT_PREFERENCES };
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      lang: parsed.lang === 'sv' || parsed.lang === 'en' ? parsed.lang : DEFAULT_PREFERENCES.lang,
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : DEFAULT_PREFERENCES.theme,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: Preferences): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    return;
  }
}
