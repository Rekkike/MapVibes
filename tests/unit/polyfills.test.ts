import { afterEach, describe, expect, test, vi } from 'vitest';

// The minimum platform (FR-61): where the array method at is missing (before
// Safari 15.4), the application supplies it before the PDF library loads.
const TypedArray = Object.getPrototypeOf(Uint8Array.prototype) as { at?: unknown };
const native = { array: Array.prototype.at, string: String.prototype.at, typed: TypedArray.at };

afterEach(() => {
  Object.defineProperty(Array.prototype, 'at', { value: native.array, writable: true, configurable: true, enumerable: false });
  Object.defineProperty(String.prototype, 'at', { value: native.string, writable: true, configurable: true, enumerable: false });
  Object.defineProperty(TypedArray, 'at', { value: native.typed, writable: true, configurable: true, enumerable: false });
});

async function withoutNative(): Promise<void> {
  delete (Array.prototype as { at?: unknown }).at;
  delete (String.prototype as { at?: unknown }).at;
  delete TypedArray.at;
  expect('at' in []).toBe(false);
  vi.resetModules();
  await import('../../src/polyfills');
}

describe('the array method at, where the browser lacks it (FR-61)', () => {
  test('it is supplied for arrays, strings, and typed arrays, as the standard describes it', async () => {
    await withoutNative();
    const list = [10, 20, 30];
    const cases: Array<[number, unknown]> = [
      [0, 10],
      [2, 30],
      [-1, 30],
      [-3, 10],
      [3, undefined],
      [-4, undefined],
      [1.7, 20],
      [-1.2, 30],
      [Number.NaN, 10],
    ];
    for (const [i, expected] of cases) {
      expect(list.at(i), String(i)).toBe(expected);
      expect(native.array.call(list, i), String(i)).toBe(expected);
    }
    expect('abc'.at(-1)).toBe('c');
    expect(new Uint8Array([1, 2, 3]).at(-2)).toBe(2);
    // Not enumerable: it never shows up in a for-in loop over an array.
    const keys: string[] = [];
    for (const k in list) keys.push(k);
    expect(keys).toEqual(['0', '1', '2']);
  });

  test('a native method is left as it is', async () => {
    vi.resetModules();
    await import('../../src/polyfills');
    expect(Array.prototype.at).toBe(native.array);
  });

  test('the polyfill is the first module the application imports', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const first = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8').split('\n')[0];
    expect(first).toBe("import './polyfills';");
  });
});
