import '@testing-library/jest-dom'

// jsdom doesn't implement scrollIntoView; polyfill to avoid test errors
// noinspection JSUnusedGlobalSymbols
window.HTMLElement.prototype.scrollIntoView = () => {}

// Node v22+ ships its own Web Storage implementation on globalThis, but it
// requires the --localstorage-file CLI flag to point at a backing file.
// Without that flag the object exists but every method throws.
//
// In this Vitest+jsdom environment, window === globalThis, so both bare
// `localStorage` and `window.localStorage` resolve to this broken built-in —
// jsdom creates its own localStorage on the jsdom window object, but that
// object is not globalThis in the test process. There is no window.localStorage
// escape hatch.
//
// The fix is the same pattern used for other missing Web APIs (scrollIntoView,
// matchMedia, etc.): replace the broken global with a faithful in-memory
// implementation. Production code is unaffected; browsers provide the real API.
;(function installLocalStorage() {
  const store: Record<string, string> = {}
  const impl: Storage = {
    get length() {
      return Object.keys(store).length
    },
    key(index) {
      return Object.keys(store)[index] ?? null
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key, value) {
      store[key] = String(value)
    },
    removeItem(key) {
      delete store[key]
    },
    clear() {
      for (const k of Object.keys(store)) delete store[k]
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    writable: true,
    configurable: true,
    value: impl,
  })
})()

// jsdom doesn't implement matchMedia; stub it so useTheme (and any component
// that calls window.matchMedia) doesn't throw in tests.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// jsdom doesn't implement ResizeObserver; stub it so components that use it
// (e.g. IssueGraph) don't throw in tests. jsdom returns zeros from
// getBoundingClientRect so dimensions will be { width: 0, height: 0 } —
// that's fine; tests validate prop plumbing, not pixel values.
if (!globalThis.ResizeObserver) {
  class ResizeObserverStub {
    private callback: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.callback = cb
    }
    observe(target: Element) {
      const rect = target.getBoundingClientRect()
      this.callback(
        [
          {
            contentRect: rect,
            target,
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      )
    }
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  })
}
