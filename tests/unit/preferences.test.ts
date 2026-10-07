import { beforeEach, describe, expect, test } from 'vitest';
import { loadPreferences, savePreferences, DEFAULT_PREFERENCES } from '../../src/preferences';
import { strings, sv, en } from '../../src/i18n';

describe('preferences (FR-19, FR-20, FR-21)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('defaults are English and follow-system when nothing is stored', () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.lang).toBe('en');
    expect(DEFAULT_PREFERENCES.theme).toBe('system');
  });

  test('the language choice is remembered in local storage', () => {
    savePreferences({ lang: 'sv', theme: 'system' });
    expect(loadPreferences().lang).toBe('sv');
  });

  test('the theme choice is remembered in local storage', () => {
    savePreferences({ lang: 'en', theme: 'dark' });
    expect(loadPreferences().theme).toBe('dark');
  });

  test('corrupted storage falls back to the defaults', () => {
    localStorage.setItem('mapvibes.preferences', '{not json');
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  test('unknown stored values fall back to the defaults', () => {
    localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'fr', theme: 'sepia' }));
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('translations (FR-19)', () => {
  test('the Swedish dictionary covers the same keys as the English dictionary', () => {
    expect(Object.keys(sv).sort()).toEqual(Object.keys(en).sort());
  });

  test('strings resolves both languages', () => {
    expect(strings('en').appName).toBe('MapVibes');
    expect(strings('sv').listArea).toBe('Lista');
  });
});
