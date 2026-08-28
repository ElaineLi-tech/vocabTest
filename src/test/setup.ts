import '@testing-library/jest-dom/vitest'

// jsdom 某些版本不提供 localStorage；统一 polyfill 内存实现
if (typeof window !== 'undefined') {
  let store: Record<string, string> = {}
  const memStorage: Storage = {
    get length() { return Object.keys(store).length },
    clear() { store = {} },
    getItem(k) { return k in store ? store[k] : null },
    setItem(k, v) { store[k] = String(v) },
    removeItem(k) { delete store[k] },
    key(i) { return Object.keys(store)[i] ?? null },
  }
  Object.defineProperty(window, 'localStorage', { value: memStorage, writable: true, configurable: true })
  // @ts-ignore
  Object.defineProperty(globalThis, 'localStorage', { value: memStorage, writable: true, configurable: true })
}


// 部分浏览器 API 仍需 mock
if (typeof window !== 'undefined') {
  // SpeechSynthesis mock
  if (typeof (window as any).speechSynthesis === 'undefined') {
    const noop = () => {}
    ;(window as any).speechSynthesis = {
      speak: noop,
      cancel: noop,
      getVoices: () => [],
      pause: noop,
      resume: noop,
      pending: false,
      speaking: false,
      paused: false,
    }
  }
  if (typeof (window as any).SpeechSynthesisUtterance === 'undefined') {
    ;(window as any).SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text: string) {
      this.text = text
      ;(this as any).lang = 'en-US'
      ;(this as any).rate = 1
    }
  }

  // html2canvas tests: prevent real calls
  if (typeof (window as any).matchMedia === 'undefined') {
    ;(window as any).matchMedia = (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
  }

  // print mock
  if (typeof (window as any).print === 'undefined') {
    ;(window as any).print = () => {}
  }

  // ResizeObserver mock (needed for Recharts ResponsiveContainer in jsdom)
  if (typeof (window as any).ResizeObserver === 'undefined') {
    class ResizeObserverMock {
      constructor(private cb: ResizeObserverCallback) {}
      observe(el: Element) {
        // Fire once so charts size correctly in tests
        try {
          const cr = el.getBoundingClientRect ? el.getBoundingClientRect() : ({ left: 0, top: 0, width: 400, height: 200 } as DOMRectReadOnly)
          const entry = { contentRect: cr, target: el } as unknown as ResizeObserverEntry
          this.cb([entry], this as any)
        } catch {}
      }
      unobserve() {}
      disconnect() {}
    }
    ;(window as any).ResizeObserver = ResizeObserverMock
    ;(globalThis as any).ResizeObserver = ResizeObserverMock
  }

  // URL.createObjectURL / revokeObjectURL (needed for Blob downloads in jsdom)
  if (typeof (URL as any).createObjectURL !== 'function') {
    let id = 0
    ;(URL as any).createObjectURL = (_b: any) => `blob:mock://${++id}`
    ;(URL as any).revokeObjectURL = () => {}
  }
  // Blob.text polyfill for older jsdom builds
  if (typeof (globalThis as any).Blob !== 'undefined' && typeof (globalThis as any).Blob.prototype.text !== 'function') {
    // Note: in jsdom, Blob stores parts internally. Provide a fallback that also works via FileReader.
    ;(globalThis as any).Blob.prototype.text = async function (): Promise<string> {
      try {
        const blob = this as Blob
        return await new Promise<string>((resolve, reject) => {
          const fr = new FileReader()
          fr.onerror = () => reject(fr.error)
          fr.onload = () => resolve(String(fr.result ?? ''))
          fr.readAsText(blob)
        })
      } catch {
        return ''
      }
    }
  }

  // navigator.clipboard mock
  if (!(navigator as any).clipboard) {
    let buffer = ''
    ;(navigator as any).clipboard = {
      writeText: async (t: string) => { buffer = t },
      readText: async () => buffer,
    }
  }
}
