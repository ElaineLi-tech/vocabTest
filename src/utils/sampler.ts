import type { LevelPool } from '@/utils/levels'

export interface SamplerLevelData extends LevelPool {}

export interface SamplerQuestion {
  level: number
  levelName: string
  /** LevelWord 对象（完整结构，保存结果用） */
  word: SamplerLevelData['words'][number]
  /** 打乱后的释义选项（4 条） */
  options: string[]
  /** options 中正确项的下标（0..3） */
  correctIdx: number
  /** 未打乱前的正确释义下标（兼容旧代码，现恒为 0） */
  _preShuffleCorrectIdx: number
}

/**
 * 抽样器状态：除原 seen / lastResults / perLevelSampled / currentLevel / answered 外，
 * 核心新增 perLevelLive：每档「未使用」下标的可变 live 数组（借用：swap-and-pop 移除，复用在 per 档初始化时从 pool.allIdx.slice() 拷贝一份）。
 * perLevelLive 使 pickNext 从 O(N) 扫 seen 变为 O(1) 随机取。
 * 同时 samePosLive（每个词性的 live 下标切片）在 makeDistractors 时不再重建同词性数组。
 */
export interface SamplerState {
  answered: number
  lastResults: number[]
  currentLevel: number | null
  /** level:wordLower -> 空对象（仅作 O(1) exists 判定；保持 seen 用于兼容） */
  seen: Set<string>
  perLevelSampled: Record<number, number>
  /** level -> Int32Array-like mutable live 下标池（可用 Set/Array 混合用数组便于 swap-pop） */
  perLevelLive: Record<number, number[]>
  /** level -> 词性 -> 词性 live 下标数组（与 perLevelLive 同步；当 pool 中该词性缺失时退化为整个档的 live） */
  perLevelPosLive: Record<number, Record<string, number[]>>
}

export function createSamplerState(): SamplerState {
  return {
    answered: 0,
    lastResults: [],
    currentLevel: null,
    seen: new Set(),
    perLevelSampled: {},
    perLevelLive: {},
    perLevelPosLive: {},
  }
}

/** 伪随机（可注入）抽取 idx ∈ [0,len) */
export type Rng = () => number
const DEFAULT_RNG: Rng = () => Math.random()

/**
 * 确保某档 live 数组已初始化（如果尚未）：一次性从 pool.allIdx 复制出来；同时为该档构建 perLevelPosLive（基于 pool.samePos）。
 * 只在首次用到该档时跑一次，后面不会再触发。
 */
function ensureLiveFor(state: SamplerState, pool: LevelPool) {
  const lv = pool.level
  if (state.perLevelLive[lv] != null) return
  // 复制一份 Int32Array -> 普通 number[]（可 splice/pop）
  const live = Array.from(pool.allIdx)
  state.perLevelLive[lv] = live
  // samePos 池的 live 版本：记录 idx 在 live 数组中的位置？不需要——更直接：samePos 的 Int32Array 是「静态全集」，
  // 取干扰项时检查 seen.has 或 exclude 就好（1 次 Set.has，比重建候选快几个量级）。
  // 这里保持 samePos 为静态（pool.samePos），不额外 build posLive。
}

/** 构造干扰项：利用 LevelPool 的预构建 samePos / lowerToIdx / tran 数组。
 *  - exclude：一次性 O(1) 定位正确词（lowerToIdx）
 *  - 同词性池：直接从 pool.samePos[wantPos] 取静态下标，逐个尝试只需 Set.has（exclude + 重复释义过滤）
 *  - 每池尝试次数限制 10，O(k) 常数时间
 */
export function makeDistractors(
  correctWord: LevelPool['words'][number],
  pool: LevelPool,
  n = 3,
  rng: Rng = DEFAULT_RNG,
  excludeExtra: Set<number> | null = null,
): string[] {
  const N = pool.N
  if (N <= 1) return Array(n).fill('（其他释义）')
  const correctLower = correctWord.w.toLowerCase()
  const correctIdx = pool.lowerToIdx[correctLower] ?? -1
  const correctTran = pool.tran[correctIdx] ?? correctWord.w
  const wantPos = pool.pos[correctIdx] ?? ''

  const exclude = new Set<number>()
  if (correctIdx >= 0) exclude.add(correctIdx)
  if (excludeExtra) for (const x of excludeExtra) exclude.add(x)
  // 已选过的释义：避免干扰项重复（尽管是不同词但释义相同）
  const usedTrans = new Set<string>([correctTran])

  const samePosArr = pool.samePos[wantPos] || pool.allIdx
  const allArr = pool.allIdx

  function takeFrom(poolArr: ArrayLike<number>): string | null {
    const L = poolArr.length
    // 用伪随机 hash 做位置扫描：避免在数组中 exclude 标记，失败直接跳过（最多尝试 12 次）
    let start = Math.floor(rng() * L)
    for (let k = 0; k < 12; k++) {
      const i = (start + k) % L
      const wi = poolArr[i]
      if (exclude.has(wi)) continue
      const t = pool.tran[wi]
      if (!t || usedTrans.has(t)) continue
      // 字数差过滤（≤1 跳过 45% 概率）
      if (correctTran && t.length > 2 && Math.abs(t.length - correctTran.length) <= 1) {
        if (rng() < 0.45) continue
      }
      exclude.add(wi)
      usedTrans.add(t)
      return t
    }
    return null
  }

  const chosen: string[] = []
  // 先尝试相同词性池 3 次；失败回落到全集池；再次失败用占位
  let phase: 0 | 1 | 2 = 0
  while (chosen.length < n) {
    let t: string | null = null
    if (phase === 0) {
      t = takeFrom(samePosArr)
      if (t == null) phase = 1
    }
    if (phase === 1) {
      t = takeFrom(allArr)
      if (t == null) phase = 2
    }
    if (phase === 2) {
      chosen.push('（其他常用释义）')
      continue
    }
    if (t != null) chosen.push(t)
  }
  return chosen
}

/** Fisher-Yates；返回新的选项数组 + 正确项在新数组中的位置 */
export function shuffleOptions(options: string[], correctIdx: number, rng: Rng = DEFAULT_RNG) {
  const arr = options.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return { options: arr, correctIdx: arr.indexOf(options[correctIdx]) }
}

function nearest(arr: number[], v: number) {
  let best = arr[0]; let bestD = Math.abs(arr[0] - v)
  for (const a of arr) { const d = Math.abs(a - v); if (d < bestD) { best = a; bestD = d } }
  return best
}
function exploreOrder(levelsSortedAsc: number[], start: number): number[] {
  const set = new Set(levelsSortedAsc)
  const out: number[] = []
  if (set.has(start)) out.push(start)
  for (let d = 1; d <= 20; d++) {
    if (set.has(start - d)) out.push(start - d)
    if (set.has(start + d)) out.push(start + d)
  }
  return out
}

/** 全档列表（1-10），用于 target 计算的上下界，不受「哪些档已加载到内存」影响 */
const ALL_LEVELS_CONST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/**
 * 根据近期答题正确率计算下一个 target level。
 *
 * 关键：上下界用 ALL_LEVELS_CONST（全档 1-10），而非「已加载到内存的档」。
 * 这样即使用户连续答对、target 升到 L6/L7 但这些档还没加载，
 * computeTarget 也会返回正确的 L6/L7，让上层 pickQuestion 触发 ensureLevel 懒加载。
 *
 *  - 首题：L4（CET-4 起步）
 *  - 最近 5 题正确率 ≥60% → 升 1 档（满 5 题升 2 档）
 *  - ≤30% → 降 1 档（满 5 题降 2 档）
 *  - 某档已采样 ≥10 题 → 强制升 1 档（避免在低档刷分）
 */
export function computeTarget(
  state: SamplerState,
  allLevels: number[] = ALL_LEVELS_CONST,
): number {
  if (state.currentLevel == null || state.answered === 0) {
    return allLevels.includes(4) ? 4 : allLevels[Math.floor(allLevels.length / 2)]
  }
  const recent = state.lastResults.slice(-5)
  const hitRate = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0.5
  const cur = state.currentLevel
  let target: number
  if (hitRate >= 0.6) target = Math.min(allLevels[allLevels.length - 1], cur + (recent.length >= 5 ? 2 : 1))
  else if (hitRate <= 0.3) target = Math.max(allLevels[0], cur - (recent.length >= 5 ? 2 : 1))
  else target = cur
  if ((state.perLevelSampled[target] ?? 0) >= 10) target = Math.min(allLevels[allLevels.length - 1], target + 1)
  if (!allLevels.includes(target)) target = nearest(allLevels, target)
  return target
}

/**
 * 抽样下一题（O(1) swap-and-pop 版本）：
 *  - 首次进入某档，自动调用 ensureLiveFor 构建 perLevelLive（一次性 O(N) 拷贝）
 *  - 选词：从 levelLive 中 rand 一个位置，和末尾 swap，pop 末尾（同时 seen.add 兜底、perLevelPosLive 不维护避免同步开销）
 *  - 干扰项：makeDistractors(pooled) 不再 O(N) 重扫词性
 *
 * 注意：调用方应先用 computeTarget 算出 target 并确保 target 档已加载（ensureLevel），
 * 否则 pickNext 只能从「已加载」的档里选最近的，可能回退到 L4。
 */
export function pickNext(
  state: SamplerState,
  levels: Record<number, SamplerLevelData>,
  rng: Rng = DEFAULT_RNG,
): SamplerQuestion | null {
  if (!state || !levels) return null
  const existing = Object.keys(levels).map(Number).sort((a, b) => a - b)
  if (existing.length === 0) return null

  // 1) 决定 target level（用已加载档做回退，理想情况 target 档已由上层 ensureLevel 加载）
  const target = computeTarget(state)

  // 2) 依次从 exploreOrder 的 level 中选词
  const order = exploreOrder(existing, target)
  let chosenLevel = -1
  let chosenIdx = -1
  for (const lvl of order) {
    const pool = levels[lvl]
    if (!pool || pool.N === 0) continue
    ensureLiveFor(state, pool)
    const live = state.perLevelLive[lvl]
    if (live == null || live.length === 0) continue
    // swap-and-pop：rand pos <-> last, pop last
    const pos = Math.floor(rng() * live.length)
    const last = live.length - 1
    const pick = live[pos]
    if (pos !== last) { live[pos] = live[last]; live[last] = pick }
    live.pop()
    chosenLevel = lvl
    chosenIdx = pick
    break
  }
  if (chosenLevel < 0) return null
  const pool = levels[chosenLevel]
  const word = pool.words[chosenIdx]

  // 3) 构造 options + 干扰项
  const distractors = makeDistractors(word, pool, 3, rng)
  const correctTran = pool.tran[chosenIdx] ?? word.w
  const optionsRaw = [correctTran, ...distractors]
  const shuffled = shuffleOptions(optionsRaw, 0, rng)
  return {
    level: chosenLevel,
    levelName: pool.name ?? `L${chosenLevel}`,
    word,
    options: shuffled.options,
    correctIdx: shuffled.correctIdx,
    _preShuffleCorrectIdx: 0,
  }
}

/**
 * 更新 SamplerState：用户完成一题后调用（mark mastered，记录 perLevelSampled 计数，seen 去重兜底）。
 * 因为 pickNext 已经从 perLevelLive 中 swap-pop 移除了该词，这里不再重复移除，只更新统计字段。
 */
export function applyAnswer(
  state: SamplerState,
  q: { level: number; word: { w: string } },
  mastered: boolean,
): SamplerState {
  const seen = new Set(state.seen)
  seen.add(`${q.level}:${q.word.w.toLowerCase()}`)
  const lastResults = [...state.lastResults, mastered ? 1 : 0].slice(-5)
  const perLevelSampled = { ...state.perLevelSampled, [q.level]: (state.perLevelSampled[q.level] ?? 0) + 1 }
  // perLevelLive / perLevelPosLive 直接复用（pickNext 已经移除）
  return {
    ...state,
    answered: state.answered + 1,
    lastResults,
    currentLevel: q.level,
    seen,
    perLevelSampled,
    // 浅层拷贝，避免新旧状态共享同一对象引用（但深层 live 数组可复用因为已经被 pickNext 突变过）
    perLevelLive: { ...state.perLevelLive },
    perLevelPosLive: { ...state.perLevelPosLive },
  }
}
