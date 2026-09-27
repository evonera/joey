import '@testing-library/jest-dom';

// Node 26 exposes a gated global `localStorage` property that can shadow
// jsdom's browser storage. Bind jsdom storage when available, with a small
// in-memory Storage fallback for jsdom's opaque-origin mode.
const testLocalStorage = (() => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
})();
if (testLocalStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: testLocalStorage,
  });
} else {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(String(key)) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(String(key)),
      setItem: (key: string, value: string) => values.set(String(key), String(value)),
    },
  });
}

if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
