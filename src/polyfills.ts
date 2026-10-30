// The minimum platform (FR-61): the bundled PDF library calls the array
// method at while it loads, which browsers before Safari 15.4 (iOS 15.4)
// lack; without it the whole application stops before it starts. This
// module is imported first, so that the method exists before the library is
// evaluated. It defines the method only where it is missing, as the standard
// describes it, for arrays, strings, and typed arrays.

function at(this: { length: number; [index: number]: unknown }, index: number): unknown {
  const length = this.length;
  const relative = Math.trunc(index) || 0;
  const k = relative >= 0 ? relative : length + relative;
  return k < 0 || k >= length ? undefined : this[k];
}

const TypedArray = Object.getPrototypeOf(Uint8Array.prototype) as object;
for (const target of [Array.prototype, String.prototype, TypedArray]) {
  if (!('at' in target)) Object.defineProperty(target, 'at', { value: at, writable: true, configurable: true, enumerable: false });
}

export {};
