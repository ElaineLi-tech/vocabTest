import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyAnswer, computeTarget, createSamplerState, pickNext, shuffleOptions, type SamplerLevelData, type SamplerQuestion, type SamplerState } from '@/utils/sampler'
import { getLevelMeta, listLevels, loadLevel, peekCachedLevel, type LevelPool } from '@/utils/levels'
import { estimate, type PerLevelStat } from '@/utils/estimator'

type Step = 'question' | 'reveal'

export interface Question {
  level: number
  levelName: string
  word: string
  /** LevelWord 原始结构，保存结果 / 音标时用 */
  _raw: any
  /** 未打乱的正确释义 */
  correctTran: string
  /** 打乱后的展示选项 */
  options: string[]
  /** options 中正确项的下标（0..3） */
  correctIdx: number
}

export interface QuizResult {
  id: string
  mode: 'fast' | 'precise'
  date: number
  done: number
  total: number
  perLevel: Array<{
    level: number
    name: string
    mastered: number
    sampled: number
    levelTotal: number
    unknown: Array<{ word: string; tran: string; level: number }>
  }>
  totalVocab: number
  ci: number
}

const MODE_LIMIT: Record<'fast' | 'precise', number> = { fast: 40, precise: 80 }
/** 用户选完选项后，高亮对/错并显示例句的停留时间（毫秒），之后自动跳下一题。 */
const REVEAL_DURATION_MS = 650

/**
 * 启动时立刻加载的档（首题出 L4，阻塞路径只拿这 1 档 ≈ 2MB uncompressed）。
 * 其余档位在「升/降档算法算出 target 且内存未加载」时按需懒加载，
 * 这样移动端弱网启动只并发 1 个 JSON，手机首屏时间从 6–10s 压到 1–2s。
 * L5 作为邻档，在 L4 首题 loading=false 后以 idle 低优先级后台预热（桌面/强网都受益）。
 */
const BOOT_LEVEL = 4
const WARMUP_NEIGHBOR = 5
const ALL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/** 手机 / 慢网（effectiveType 2g/3g 或 viewport ≤ 768px）：严格只阻塞加载 BOOT_LEVEL 单档，邻居档都延后到需要时才拿。 */
function isConstrainedDevice(): boolean {
  if (typeof window === 'undefined') return false
  const viewport = Math.max(window.innerWidth ?? 480, window.innerHeight ?? 480) <= 768
  const conn = (navigator as any).connection as any
  const slowNet = ['slow-2g', '2g', '3g'].includes(String(conn?.effectiveType ?? ''))
  const saveData = Boolean(conn?.saveData)
  return viewport || slowNet || saveData
}

export function useQuizEngine(mode: 'fast' | 'precise') {
  const total = MODE_LIMIT[mode]

  // 词档数据
  const [levels, setLevels] = useState<Record<number, SamplerLevelData>>({})
  const [loading, setLoading] = useState(true)
  const levelsRef = useRef(levels)
  useEffect(() => { levelsRef.current = levels }, [levels])

  // 抽样与掌握统计
  const [samplerState, setSamplerState] = useState<SamplerState>(() => createSamplerState())
  const [perLevel, setPerLevel] = useState<Record<number, { mastered: number; sampled: number; unknown: Array<{ word: string; tran: string; level: number }> }>>({})
  const samplerStateRef = useRef(samplerState)
  const perLevelRef = useRef(perLevel)
  useEffect(() => { samplerStateRef.current = samplerState }, [samplerState])
  useEffect(() => { perLevelRef.current = perLevel }, [perLevel])

  // 状态机：question（待选，直接显示 4 选项） → reveal（已作答，揭示对错 + 短暂停留） → 自动下一题
  const [step, setStep] = useState<Step>('question')
  const [pendingQ, setPendingQ] = useState<Question | null>(null)
  const [pendingSamplerQ, setPendingSamplerQ] = useState<SamplerQuestion | null>(null)
  /** reveal 步骤用户选的选项下标 */
  const [chosenIdx, setChosenIdx] = useState<number | null>(null)
  // 预取缓存：reveal 阶段进入后立刻算下一题，REVEAL_DURATION_MS 到时后直接同步跳转
  const prefetchRef = useRef<{ sampler: SamplerQuestion; q: Question } | null>(null)
  const prefetchBusyRef = useRef(false)
  // reveal → next 的定时器句柄，用于在卸载/重置时清掉，避免 setState 泄漏
  const revealTimerRef = useRef<number | null>(null)

  // 首次启动：阻塞路径只加载 BOOT_LEVEL(L4≈2MB)，首题立刻出；
  // 非受限设备（桌面/强网）再在浏览器空闲 requestIdleCallback 中预热 L5 邻档；
  // 其它 1/2/3/6/7/8/9/10 档全部延迟：升/降档算法算出 target 且未加载时，由 pickQuestion → ensureLevel 懒加载兜底
  useEffect(() => {
    let alive = true
    setLoading(true)
    setLevels({})
    setSamplerState(createSamplerState())
    setPerLevel({})
    setPendingQ(null)
    setPendingSamplerQ(null)
    setChosenIdx(null)
    prefetchRef.current = null
    prefetchBusyRef.current = false
    if (revealTimerRef.current != null) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null }

    void (async () => {
      const boot = await loadLevel(BOOT_LEVEL).catch(() => null)
      if (!alive) return
      const map: Record<number, LevelPool> = {}
      if (boot) map[boot.level] = boot
      levelsRef.current = map
      setLevels(map)
      setLoading(false)

      // 非受限设备：空闲时后台预热 L5（答对 1–2 题就升档的常见路径）
      if (!isConstrainedDevice() && alive) {
        const warmup = () => {
          if (!alive || peekCachedLevel(WARMUP_NEIGHBOR)) return
          loadLevel(WARMUP_NEIGHBOR)
            .then((L: LevelPool) => {
              if (!alive) return
              const cur = { ...levelsRef.current }
              if (!cur[L.level]) { cur[L.level] = L; levelsRef.current = cur; setLevels(cur) }
            })
            .catch(() => { /* NOOP */ })
        }
        const ric = (globalThis as any).requestIdleCallback
        if (typeof ric === 'function') ric(warmup, { timeout: 1500 })
        else setTimeout(warmup, 700)
      }
    })()
    return () => {
      alive = false
      if (revealTimerRef.current != null) clearTimeout(revealTimerRef.current)
    }
  }, [mode])

  const ensureLevel = useCallback(async (level: number): Promise<Record<number, SamplerLevelData>> => {
    const now = levelsRef.current
    if (now[level]?.N) return now
    try {
      const L = await loadLevel(level)
      const next = { ...now, [L.level]: L }
      levelsRef.current = next
      setLevels(next)
      return next
    } catch {
      return now
    }
  }, [])

  function bindQuestion(sampler: SamplerQuestion): { sampler: SamplerQuestion; q: Question } {
    const correctTran = sampler.options[sampler.correctIdx]
    const q: Question = {
      level: sampler.level,
      levelName: sampler.levelName,
      word: sampler.word.w,
      _raw: sampler.word,
      correctTran,
      options: sampler.options,
      correctIdx: sampler.correctIdx,
    }
    return { sampler, q }
  }

  const pickQuestion = useCallback(async (state: SamplerState): Promise<{ sampler: SamplerQuestion | null; q: Question | null }> => {
    let lvs = levelsRef.current
    if (!Object.keys(lvs).length) return { sampler: null, q: null }

    // 自适应关键：先算出 target 档，如果该档还没加载进内存，立刻 ensureLevel 懒加载。
    // 之前的 bug：pickNext 只从「已加载」的档里选词，首屏只有 L4 → 题目永远来自 L4。
    const target = computeTarget(state)
    if (target && !lvs[target]) {
      lvs = await ensureLevel(target)
    }

    let sampler = pickNext(state, lvs)
    if (!sampler) {
      // pickNext 的升/降档目标如果不在内存（因为新策略只预加载 BOOT_LEVEL），
      // 就按 ALL_LEVELS 顺序依次尝试懒加载（每次加载 1 档，不并发），直到能选出题。
      // 这确保了 L1/L2/L3/L6..L10 从不被预先并发拉，只在用户答题曲线真的跳到时才 fetch。
      for (const lv of ALL_LEVELS) {
        lvs = await ensureLevel(lv)
        sampler = pickNext(state, lvs)
        if (sampler) break
      }
    }
    if (!sampler) return { sampler: null, q: null }
    const bound = bindQuestion(sampler)
    return { sampler: bound.sampler, q: bound.q }
  }, [ensureLevel])

  const pickingRef = useRef(false)
  const pickNextQuestion = useCallback(async (s: SamplerState) => {
    if (pickingRef.current) return
    pickingRef.current = true
    try {
      if (s.answered >= total) return
      const { sampler, q } = await pickQuestion(s)
      if (!q) return
      setPendingSamplerQ(sampler)
      setPendingQ(q)
      setStep('question')
      setChosenIdx(null)
    } finally {
      pickingRef.current = false
    }
  }, [pickQuestion, total])

  // 初次：loading 完成且无 pendingQ 时出首题
  useEffect(() => {
    if (!loading && !pendingQ && !pickingRef.current && !prefetchRef.current) void pickNextQuestion(samplerStateRef.current)
  }, [loading, pendingQ, pickNextQuestion])

  // reveal 停留 → 到时后自动下一题（或达到上限 → finished）
  const advanceAfterReveal = useCallback(() => {
    if (revealTimerRef.current != null) clearTimeout(revealTimerRef.current)
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null
      const st = samplerStateRef.current
      if (st.answered >= total) return // 交给 useQuizEngine 外层 useEffect 跳转结果页
      const prefetched = prefetchRef.current
      prefetchRef.current = null
      if (prefetched) {
        setPendingSamplerQ(prefetched.sampler)
        setPendingQ(prefetched.q)
        setStep('question')
        setChosenIdx(null)
        return
      }
      void pickNextQuestion(st)
    }, REVEAL_DURATION_MS)
  }, [pickNextQuestion, total])

  // 进入 reveal 后：① 触发异步 prefetch（通常 reveal 停留时间内就能返回） ② 设置定时器到时跳转
  useEffect(() => {
    if (step !== 'reveal') return
    // ① prefetch
    if (!prefetchBusyRef.current && !prefetchRef.current) {
      const current = samplerStateRef.current
      if (current.answered < total) {
        prefetchBusyRef.current = true
        void (async () => {
          try {
            const res = await pickQuestion(current)
            if (res.sampler && res.q) prefetchRef.current = { sampler: res.sampler, q: res.q }
          } finally {
            prefetchBusyRef.current = false
          }
        })()
      }
    }
    // ② 定时器跳转
    advanceAfterReveal()
    return () => {
      if (revealTimerRef.current != null) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null }
    }
  }, [step, pickQuestion, advanceAfterReveal, total])

  const perLevelStatsForEstimate = useMemo((): PerLevelStat[] => {
    const out: PerLevelStat[] = []
    const levelMetaMap = listLevels()
    for (const lvStr of Object.keys(perLevel)) {
      const lv = Number(lvStr)
      const st = perLevel[lv]
      if (st.sampled === 0) continue
      const meta = levelMetaMap.find(m => m.level === lv)
      out.push({
        level: lv,
        name: meta?.name ?? `L${lv}`,
        mastered: st.mastered,
        sampled: st.sampled,
        levelTotal: meta?.total ?? 0,
      })
    }
    return out
  }, [perLevel])

  const isFinished = !loading && samplerState.answered >= total
  const result = useMemo((): QuizResult => {
    const done = samplerState.answered
    const est = estimate(perLevelStatsForEstimate, { precise: mode === 'precise' })
    const allMeta = listLevels()
    const perLevelArr: QuizResult['perLevel'] = []
    for (const m of allMeta) {
      const st = perLevel[m.level]
      perLevelArr.push({
        level: m.level,
        name: m.name,
        mastered: st?.mastered ?? 0,
        sampled: st?.sampled ?? 0,
        levelTotal: m.total,
        unknown: st?.unknown ?? [],
      })
    }
    return {
      id: `R-${Date.now().toString(36)}`,
      mode,
      date: Date.now(),
      done,
      total,
      perLevel: perLevelArr,
      totalVocab: est.total,
      ci: est.ciPercent,
    }
  }, [isFinished, samplerState.answered, perLevelStatsForEstimate, perLevel, mode])

  const recordPerLevelAnswer = (level: number, mastered: boolean, unknownWord: { word: string; tran: string; level: number } | null) => {
    setPerLevel(prev => {
      const cur = prev[level] ?? { mastered: 0, sampled: 0, unknown: [] }
      const nextUnknown = mastered || !unknownWord ? cur.unknown : [...cur.unknown, unknownWord]
      return {
        ...prev,
        [level]: {
          mastered: cur.mastered + (mastered ? 1 : 0),
          sampled: cur.sampled + 1,
          unknown: nextUnknown,
        },
      }
    })
  }

  /** 用户直接点击一个释义选项（或数字键 1..4） → 判定、记录、进入 reveal（稍后自动跳转） */
  const actSelect = (idx: number) => {
    if (step !== 'question' || !pendingQ || !pendingSamplerQ) return
    setChosenIdx(idx)
    const correct = idx === pendingQ.correctIdx
    const lv = pendingQ.level
    const unknown = correct ? null : { word: pendingQ.word, tran: pendingQ.correctTran, level: lv }
    const ns = applyAnswer(samplerStateRef.current, pendingSamplerQ, correct)
    recordPerLevelAnswer(lv, correct, unknown)
    setSamplerState(ns)
    setStep('reveal')
  }

  const progress = { done: samplerState.answered, total }

  return {
    step,
    loading,
    currentQuestion: pendingQ,
    chosenIdx,
    progress,
    isFinished,
    result,
    actSelect,
  } as const
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unusedShuffle: typeof shuffleOptions | undefined = undefined
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unusedMeta: typeof getLevelMeta | undefined = undefined
void _unusedShuffle; void _unusedMeta
