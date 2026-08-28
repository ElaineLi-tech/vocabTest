import { describe, it, expect } from 'vitest'
import type { SamplerLevelData } from '@/utils/sampler'
import {
  applyAnswer, createSamplerState, makeDistractors, pickNext,
  shuffleOptions,
} from '@/utils/sampler'
import type { LevelPool, LevelWord } from '@/utils/levels'

/** 把 mock LevelData（words 数组 + level + name + total）升级为 LevelPool（预构建索引池），与 runtime 的 buildPool 逻辑一致 */
function asPool(level: number, name: string, total: number, words: LevelWord[]): LevelPool {
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

function buildMockLevels(): Record<number, SamplerLevelData> {
  const mkLevel = (level: number, count: number, seed: string) => {
    const words = Array.from({ length: count }, (_, i) => ({
      w: `${seed}-${i}`,
      t: [{ v: `${seed} 第 ${i} 释义 - ${i * 3} 中文内容`, p: ['n', 'v', 'adj', 'adv'][i % 4] }],
      s: [{ e: `Example ${i}`, c: `例句 ${i}` }],
    }))
    return asPool(level, `L${level}`, count, words)
  }
  return {
    3: mkLevel(3, 40, 'L3w'),
    4: mkLevel(4, 50, 'L4w'),
    5: mkLevel(5, 48, 'L5w'),
    6: mkLevel(6, 55, 'L6w'),
  }
}

describe('sampler: pickNext (TR-2.1/TR-2.2/TR-2.3)', () => {
  it('首题起档 L4（answered=0）', () => {
    const q = pickNext(createSamplerState(), buildMockLevels(), mkRng([0.1]))
    expect(q).not.toBeNull()
    expect(q!.level).toBe(4)
  })

  it('最近 5 题高正确率 hitRate=0.8 会升档到 L5/L6', () => {
    const s = createSamplerState()
    s.answered = 5
    s.currentLevel = 4
    s.lastResults = [1, 1, 1, 1, 0] // 0.8
    const levels = buildMockLevels()
    const q = pickNext(s, levels, mkRng([0.2]))
    expect([5, 6]).toContain(q!.level)
  })

  it('最近 5 题低正确率 hitRate=0.2 会降档到 L4/L5（从当前 6）', () => {
    const s = createSamplerState()
    s.answered = 5
    s.currentLevel = 6
    s.lastResults = [0, 0, 1, 0, 0]
    const q = pickNext(s, buildMockLevels(), mkRng([0.5]))
    expect([4, 5]).toContain(q!.level)
  })

  it('不会重复抽取同一个词', () => {
    let s = createSamplerState()
    const levels = buildMockLevels()
    const seenWords = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const q = pickNext(s, levels, mkRng([i / 100]))
      expect(q).not.toBeNull()
      const key = `${q!.level}:${q!.word.w}`
      expect(seenWords.has(key)).toBe(false)
      seenWords.add(key)
      s = applyAnswer(s, q!, true)
    }
    expect(s.answered).toBe(20)
  })

  it('shuffleOptions 不丢正确答案', () => {
    for (let i = 0; i < 10; i++) {
      const { options, correctIdx } = shuffleOptions(['A', 'B', 'C', 'D'], 0, mkRng([i / 10]))
      expect(options.includes('A')).toBe(true)
      expect(options[correctIdx]).toBe('A')
      expect(options.length).toBe(4)
    }
  })

  it('makeDistractors 生成 3 个干扰项；不含正确项；不重复', () => {
    const levels = buildMockLevels()
    const pool = levels[4]
    const w = pool.words[0]
    const correctTran = w.t[0].v
    const ds = makeDistractors(w, pool, 3, mkRng([0.1, 0.2, 0.3]))
    expect(ds.length).toBe(3)
    expect(new Set(ds).size).toBeGreaterThanOrEqual(2)
    expect(ds.every(d => d !== correctTran)).toBe(true)
  })

  it('边界：levels 空 → pickNext 返回 null；词库仅有 1 词 → makeDistractors 返回占位符；applyAnswer 递增计数', () => {
    expect(pickNext(createSamplerState(), {})).toBeNull()
    const singleWords = [{ w: 'x', t: [{ v: 'xv', p: 'n' }] }]
    const singlePool = asPool(1, 'L1', 1, singleWords)
    const single = { 1: singlePool } as any
    const ds = makeDistractors(singlePool.words[0], singlePool, 3, mkRng([0.1]))
    expect(ds.every(s => s.includes('其他'))).toBe(true)
    const s0 = createSamplerState()
    const s1 = applyAnswer(s0, { level: 3, word: { w: 'Apple' } }, true)
    expect(s1.answered).toBe(1)
    expect(s1.currentLevel).toBe(3)
    expect(s1.seen.has('3:apple')).toBe(true)
    expect(s1.lastResults).toEqual([1])
    expect(s1.perLevelSampled[3]).toBe(1)
  })
})

/** 伪随机 rng：按给定序列循环返回；简化测试可复现 */
function mkRng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}
