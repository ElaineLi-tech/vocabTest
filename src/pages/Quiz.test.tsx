import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import Quiz from '@/pages/Quiz'
import type { LevelMeta, LevelPool, LevelWord } from '@/utils/levels'

// Mock react-router navigate 以便断言跳转。vi.mock per-file 隔离，不会影响其他测试文件。
const mockNav = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...mod,
    useNavigate: () => mockNav,
  }
})

/** 构建 LevelPool（含预构建索引）；与 runtime buildPool 逻辑一致，mock 环境的最小可用实现 */
function buildLevelPool(level: number, name: string, total: number, words: LevelWord[]): LevelPool {
  const N = words.length
  const wordLower = new Array<string>(N)
  const pos = new Array<string>(N)
  const tran = new Array<string>(N)
  const lowerToIdx: Record<string, number> = {}
  const samePosBuckets: Record<string, number[]> = Object.create(null)
  const allIdx = new Int32Array(N)
  for (let i = 0; i < N; i++) {
    const w = words[i]
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
  if (samePos[''] == null) samePos[''] = allIdx
  return { level, name, total, words, N, wordLower, pos, tran, samePos, allIdx, lowerToIdx }
}

// 使用非常小的假词库：2 档（L4 5 词，L5 5 词），每词 1 释义，避免依赖真实 JSON
const mkLevel = (level: number, prefix: string, n: number): LevelPool => {
  const words = Array.from({ length: n }, (_, i): LevelWord => ({
    w: `${prefix}${i}`,
    t: [{ v: `[L${level}] ${prefix}${i} 的释义#${i}`, p: ['n', 'v', 'adj', 'adv'][i % 4] }],
    y: i % 2 === 0 ? [{ e: `Example of ${prefix}${i}.`, c: `${prefix}${i} 的例句#${i}` }] : undefined,
  } as any))
  return buildLevelPool(level, `L${level}-${prefix}`, n, words)
}
const LV4 = mkLevel(4, 'four', 5)
const LV5 = mkLevel(5, 'five', 5)
const FAKE_META: LevelMeta[] = [
  { level: 4, name: LV4.name, total: LV4.total, file: 'L4.json' },
  { level: 5, name: LV5.name, total: LV5.total, file: 'L5.json' },
]

async function mockLevels() {
  const mod = await import('@/utils/levels')
  vi.spyOn(mod, 'listLevels').mockReturnValue(FAKE_META)
  vi.spyOn(mod, 'loadLevel').mockImplementation(async (lvl: number) => {
    if (lvl === 4) return LV4
    if (lvl === 5) return LV5
    throw new Error('only 4/5 in test mock')
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  // 让每个 test 重新起一个 mock；模块 import 要先发生
  await mockLevels()
})

function mount(query = '?mode=fast') {
  return render(<Quiz />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/quiz' + query]}>{children}</MemoryRouter> })
}

/** 通用等待 loading 结束，并返回 wordcard */
async function ensureReady() {
  await waitFor(() => expect(screen.queryByTestId('quiz-loading')).not.toBeInTheDocument(), { timeout: 3000 })
  await waitFor(() => expect(screen.getByTestId('word-card')).toBeInTheDocument(), { timeout: 2000 })
}

describe('Quiz page flow (TR-3 / TR-3.1~TR-3.5 直选 4 释义模式 v2)', () => {
  it('首屏加载完成：progress 0/40；直显 4 个释义选项；没有「认识/不认识」和「下一题」按钮；L4 起档', async () => {
    mount()
    await ensureReady()
    const card = screen.getByTestId('word-card')
    expect(screen.getByText('0 / 40')).toBeInTheDocument()
    expect(within(card).getByText(/^L4$/)).toBeInTheDocument()
    // 直显 4 选项
    ;[0,1,2,3].forEach(i => expect(screen.getByTestId(`opt-${i}`)).toBeInTheDocument())
    // 认识/不认识 / 下一题 消失
    expect(screen.queryByTestId('btn-know')).toBeNull()
    expect(screen.queryByTestId('btn-dont-know')).toBeNull()
    expect(screen.queryByTestId('btn-next')).toBeNull()
    // 还没作答：feedback 不存在
    expect(screen.queryByTestId('feedback-tag')).toBeNull()
  })

  it('点击正确选项 → feedback 掌握 +1；进度 +1；停留后自动进入下一题（新单词 & 进度 1/40）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      mount()
      await ensureReady()
      const word1 = (screen.getByText(/^four\d|^five\d/) as HTMLElement).textContent!
      // 点击正确按钮（选项文本包含 "X 的释义#i"，与 word1 匹配）
      const opts = [0,1,2,3].map(i => screen.getByTestId(`opt-${i}`))
      const correctBtn = opts.find(b => (b.textContent ?? '').includes(`${word1} 的释义`))!
      expect(correctBtn).toBeTruthy()
      act(() => { fireEvent.click(correctBtn) })
      // 立刻 reveal：tag + feedback
      await waitFor(() => expect(screen.getByTestId('feedback-tag')).toBeInTheDocument())
      expect(screen.getByTestId('feedback-tag').textContent).toBe('掌握 +1')
      expect(screen.getByTestId('feedback-correct').textContent).toContain(`${word1} 的释义`)
      expect(screen.getAllByText(/✓ 正确/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('1 / 40')).toBeInTheDocument()
      expect(screen.queryByTestId('btn-next')).toBeNull() // 无下一题按钮

      // 推进定时器 ≥ REVEAL_DURATION (650ms) → 自动跳到下一题，新单词出现
      act(() => { vi.advanceTimersByTime(900) })
      await waitFor(() => {
        const newWord = (screen.queryByText(/^four\d|^five\d/) as HTMLElement | null)?.textContent
        expect(newWord).toBeDefined()
        expect(newWord).not.toBe(word1)
      }, { timeout: 2500 })
      // 下一题状态：选项再次可交互（无 feedback-tag）或仍在 reveal；至少 word-card 存在
      expect(screen.getByTestId('word-card')).toBeInTheDocument()
      // 仍无认识/不认识按钮
      expect(screen.queryByTestId('btn-know')).toBeNull()
      expect(screen.queryByTestId('btn-dont-know')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('选错 → feedback tag「释义选错了」；仍显示 ✓正确 & ✗你的选择；进度 +1；自动进入下一题', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      mount()
      await ensureReady()
      const wordText = (screen.getByText(/^four\d|^five\d/) as HTMLElement).textContent!
      const opts = [0,1,2,3].map(i => screen.getByTestId(`opt-${i}`))
      const wrongBtn = opts.find(b => !(b.textContent ?? '').includes(`${wordText} 的释义`))!
      act(() => { fireEvent.click(wrongBtn) })
      await waitFor(() => expect(screen.getByTestId('feedback-tag')).toBeInTheDocument())
      expect(screen.getByTestId('feedback-tag').textContent).toBe('释义选错了')
      expect(screen.getAllByText(/✗ 你的选择/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/✓ 正确/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('1 / 40')).toBeInTheDocument()
      expect(screen.queryByTestId('btn-next')).toBeNull()
      // 推进定时器 → 跳到 Q2
      act(() => { vi.advanceTimersByTime(900) })
      await waitFor(() => {
        const nw = (screen.queryByText(/^four\d|^five\d/) as HTMLElement | null)?.textContent
        expect(nw).toBeDefined()
        expect(nw).not.toBe(wordText)
      }, { timeout: 2500 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('精准模式 total = 80；progress 0/80', async () => {
    mount('?mode=precise')
    await ensureReady()
    expect(screen.getByText('0 / 80')).toBeInTheDocument()
  })
})
