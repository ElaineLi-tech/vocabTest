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

/**
 * Vitest 环境：同步 mock fetch('/data/levels/*.json') → 异步读本地 src/data/levels/*.json
 * 与浏览器/Vercel 部署环境的 fetch 语义完全一致：返回 { ok, json() }。
 * 这样 levels.ts 中只有单一加载分支，构建阶段不会枚举/打包 26MB JSON，避免 Vite/Node 线程池 OOM。
 *
 * 注意：
 * - 必须在 setup.ts 退出前同步替换 globalThis.fetch（不能放在异步 IIFE 里），
 *   否则 loadLevel 测试会先调用原生 fetch 去请求 /data/levels/L4.json，404 失败。
 * - 读磁盘是异步的（fs/promises 动态 import + readFile），所以 mock 返回的 Promise
 *   会在磁盘读完成之后 resolve / reject —— 这不影响 loadLevel 接口契约，
 *   线上环境的真实 fetch 也是同样的 Promise<Response> 语义。
 * - 由于是 ESM 项目（package.json type=module），不能使用 require()，
 *   统一用动态 import('node:fs/promises') + import.meta.url 计算路径。
 */
{
  const isVitest = typeof process !== 'undefined' && (process as any).env?.VITEST === 'true'
  if (isVitest && typeof globalThis.fetch !== 'undefined' && typeof (import.meta as any)?.url === 'string') {
    const origFetch = globalThis.fetch
    // 通过当前 setup.ts 的 import.meta.url 计算项目根目录（<root>/src/test/setup.ts → <root>）
    const setupFileUrl: string = (import.meta as any).url
    let LEVELS_DIR_ABS: string | null = null
    let readText: ((absPath: string) => Promise<string>) | null = null
    const initPromise: Promise<void> = Promise.all([
      import('node:path'),
      import('node:fs/promises'),
      import('node:url'),
    ]).then(([pathMod, fsMod, urlMod]) => {
      const { resolve, dirname, basename } = pathMod
      const { fileURLToPath } = urlMod
      const setupFile = fileURLToPath(setupFileUrl)
      const PROJECT_ROOT = resolve(dirname(setupFile), '..', '..')
      LEVELS_DIR_ABS = resolve(PROJECT_ROOT, 'src', 'data', 'levels')
      readText = (p: string) => fsMod.readFile(p, 'utf8')
      // 把 basename 缓存到模块作用域，避免每个请求再 dynamic import
      ;(mockFetch as any).__basename = basename
    })

    const cache = new Map<string, string>()

    function isLevelsRequest(input: any): string | null {
      let u: string | null = null
      if (typeof input === 'string') u = input
      else if (input && typeof input.url === 'string') u = input.url
      else if (input && typeof input.toString === 'function') {
        try { u = String(input) } catch { u = null }
      }
      if (!u) return null
      const m = u.match(/\/data\/levels\/(L\d+\.json|index\.json)(?:[?#].*)?$/)
      if (!m) return null
      const raw = m[0].slice(0, m[0].length - (m[3]?.length || 0))
      const slash = raw.lastIndexOf('/')
      return slash >= 0 ? raw.slice(slash + 1).split('?')[0].split('#')[0] : null
    }

    function makeJSONResponse(file: string, body: string) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: `/data/levels/${file}`,
        type: 'basic',
        redirected: false,
        headers: new (globalThis as any).Headers ? new (globalThis as any).Headers({ 'content-type': 'application/json; charset=utf-8' }) : { get: (k: string) => k.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null },
        json: () => Promise.resolve(JSON.parse(body)),
        text: () => Promise.resolve(body),
        clone() { return makeJSONResponse(file, body) },
        get bodyUsed() { return false },
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer as any),
        blob: () => Promise.resolve(new (globalThis as any).Blob([body], { type: 'application/json; charset=utf-8' })),
      }
    }
    function makeErrorResponse(file: string, status: number, msg: string) {
      return {
        ok: false,
        status,
        statusText: msg || 'Error',
        url: `/data/levels/${file}`,
        json: () => Promise.reject(new Error(msg || String(status))),
        text: () => Promise.resolve(msg || String(status)),
        clone() { return makeErrorResponse(file, status, msg) },
        get bodyUsed() { return false },
      }
    }

    function mockFetch(input: any, init?: any): Promise<any> {
      const file = isLevelsRequest(input)
      if (file) {
        const hit = cache.get(file)
        if (hit != null) return Promise.resolve(makeJSONResponse(file, hit))
        return initPromise
          .then(() => {
            if (!LEVELS_DIR_ABS || !readText) throw new Error('Vitest levels mock init failed')
            const basename = (mockFetch as any).__basename || ((s: string) => s.slice(s.lastIndexOf('/') + 1))
            const abs = import('node:path').then(m => m.join(LEVELS_DIR_ABS!, basename(file)))
            return abs.then(a => readText!(a))
          })
          .then(body => {
            cache.set(file, body)
            return makeJSONResponse(file, body)
          })
          .catch(err => Promise.resolve(makeErrorResponse(file, 404, String(err?.message || err || 'Not Found'))))
      }
      return origFetch.call(globalThis, input, init)
    }

    ;(globalThis as any).fetch = mockFetch
  }
}

// Vitest 下所有 render 都默认放行 Gate：预先把永久有效的管理员 grant 写进 localStorage，
// 这样测试不需要手动登录。管理员 hash 取 src/utils/access.ts 里的常量 MASTER_CODE_HASH 文本。
if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
  const MASTER_HASH = '570eb2601a3baae63cf46001165d312b10fe9685d89da86e974a1b91804258c2'
  try {
    window.localStorage.setItem(
      'vt_access_granted_v1',
      JSON.stringify({
        codeHash: MASTER_HASH,
        master: true,
        grantedAt: Date.now(),
        expiresAt: Number.POSITIVE_INFINITY,
      }),
    )
  } catch { /* ignore */ }
}
