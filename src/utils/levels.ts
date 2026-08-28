import levelsIndex from '@/data/levels/index.json'

export interface LevelMeta {
  level: number
  name: string
  total: number
  file: string
}

export interface LevelWord {
  w: string
  us?: string
  uk?: string
  t: Array<{ v: string; p: string }>
  ph?: Array<{ p: string; c: string }>
  s?: Array<{ e: string; c: string }>
}

export interface LevelData {
  level: number
  name: string
  total: number
  words: LevelWord[]
}

/**
 * 每档词汇的「预构建索引池」：
 *  - 预 flatten 首词性 / 首释义 / word.toLowerCase()，避免每题循环时重复 toLowerCase / t[0]?.p / t[0]?.v 的空值检查
 *  - samePos: Record<pos, Int32Array> — 每个词性（含空串 fallback ''）对应 Int32 下标数组，取干扰项时直接切同词性池
 *  - allIdx: Int32Array — 全量 0..N-1 下标
 *  - wordLowerIdx: Record<lowerWord, idx> — 快速定位正确词，避免 exclude 每档 O(N) 扫描
 *  - 后续在 sampler 里，per-question overhead 从 O(N) 降到 O(1) ~ O(取干扰项尝试次数)
 * 所有字段均只读，不会被 sampler 改动（pool 的可用性通过 SamplerState 的 seen / per-level exclude Set 维护）
 */
export interface LevelPool extends LevelData {
  /** words.length；和 total 一致，用本地字段避免引用 */
  N: number
  /** pre-flatten: words[i].w.toLowerCase() */
  wordLower: string[]
  /** pre-flatten: words[i].t[0]?.p ?? '' （词性） */
  pos: string[]
  /** pre-flatten: words[i].t[0]?.v ?? words[i].w （首释义） */
  tran: string[]
  /** samePos[p] 为词性 p 的下标 Int32Array；空串 '' 兜底池（当词性缺失时用） */
  samePos: Record<string, Int32Array>
  /** 0..N-1 下标数组（一次性 build，避免每档每题新建） */
  allIdx: Int32Array
  /** wordLower -> index 映射（快速查重 / 排除自身） */
  lowerToIdx: Record<string, number>
}

const meta = levelsIndex as LevelMeta[]

export function listLevels(): LevelMeta[] {
  return meta.slice().sort((a, b) => a.level - b.level)
}

export function getLevelMeta(level: number): LevelMeta | undefined {
  return meta.find(m => m.level === level)
}

function buildPool(data: LevelData): LevelPool {
  const N = data.words.length
  const wordLower = new Array<string>(N)
  const pos = new Array<string>(N)
  const tran = new Array<string>(N)
  const lowerToIdx: Record<string, number> = {}
  const samePosBuckets: Record<string, number[]> = Object.create(null)
  const allIdx = new Int32Array(N)
  for (let i = 0; i < N; i++) {
    const w = data.words[i]
    const lower = w.w.toLowerCase()
    wordLower[i] = lower
    const t0 = w.t?.[0]
    const p = (t0?.p as string) ?? ''
    const v = (t0?.v as string) ?? w.w
    pos[i] = p
    tran[i] = v
    lowerToIdx[lower] = i
    allIdx[i] = i
    const bucket = samePosBuckets[p] || (samePosBuckets[p] = [])
    bucket.push(i)
  }
  const samePos: Record<string, Int32Array> = Object.create(null)
  for (const k of Object.keys(samePosBuckets)) samePos[k] = new Int32Array(samePosBuckets[k])
  // 空串兜底桶：全部下标
  if (samePos[''] == null) samePos[''] = allIdx
  return { ...data, N, wordLower, pos, tran, samePos, allIdx, lowerToIdx }
}

const LEVEL_CACHE = new Map<number, Promise<LevelPool>>()
const _SYNC_CACHE = new Map<number, LevelPool>()

/**
 * 加载并预构建 LevelPool；结果缓存，重复调用零开销。
 * 相比原版 loadLevel：返回 LevelPool（LevelData 的超集），所有原字段兼容。
 */
export function loadLevel(level: number): Promise<LevelPool> {
  const cached = LEVEL_CACHE.get(level)
  if (cached) return cached
  const m = getLevelMeta(level)
  if (!m) return Promise.reject(new Error(`Unknown level ${level}`))
  const p = import(`../data/levels/${m.file}` /* @vite-ignore */)
    .then(mod => mod.default as LevelData)
    .then(d => {
      const pool = buildPool(d)
      _SYNC_CACHE.set(level, pool)
      return pool
    })
  LEVEL_CACHE.set(level, p)
  return p
}

/** 同步拿到已缓存的 LevelPool（如果还没加载返回 undefined）——用于 ensureLevel 非阻塞检查 */
export function peekCachedLevel(level: number): LevelPool | undefined {
  return _SYNC_CACHE.get(level)
}
