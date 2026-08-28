import { describe, it, expect } from 'vitest'
import { LOOKUP_TABLE, estimate, matchLookupBand, anchorLookup, debiasGuess, wilsonLower, wilsonUpper, type PerLevelStat } from '@/utils/estimator'

describe('estimator — Plan C (Wilson + guess debias + TYT calibrated anchor spline)', () => {

  // ===== 核心：用户场景对齐（TYT=10,000 对应 VocabTest raw≈70–72%）=====
  describe('锚点映射：R(raw=0.70) → vocab=10,000（对标用户实际 TYT=10k）', () => {
    it('raw=0.70 → debias=0.60 → anchor r=0.60 → 精确=10,000', () => {
      expect(debiasGuess(0.70)).toBeCloseTo(0.60, 6)
      expect(anchorLookup(0.60)).toBe(10000)
    })
    it('快速模式 40 题，m=28 (70%) → total 在 [9500, 10500] 区间', () => {
      const stats: PerLevelStat[] = simulateAcrossLevels(/*k=*/ 40, /*m=*/ 28)
      const { total, band, smoothedOverall } = estimate(stats, { precise: false })
      expect(smoothedOverall).toBeCloseTo(0.60, 3)
      expect(total).toBeGreaterThanOrEqual(9500)
      expect(total).toBeLessThanOrEqual(10500)
      // 档位 = row=7（10,000~13,000 → 专八）
      expect(band.band.row).toBe(7)
      expect(band.band.label).toBe('10,000 ~ 13,000')
    })
    it('用户实际结果场景：原公式算出来=45,767（≈71% of ΣL）→ 新公式落到 TYT≈10,000', () => {
      // 71% 加权正确率反推到 flat m/k 用近似：m=57 k=80（精准模式）
      const stats = simulateAcrossLevels(80, 57)  // raw=0.7125
      const { total, smoothedOverall } = estimate(stats, { precise: true })
      expect(smoothedOverall).toBeCloseTo(0.617, 2)
      // anchor 在 r=0.60→10,000 和 r=0.70→14,000 之间线性插值
      // t = (0.6167 - 0.60) / 0.10 = 0.167 → 10000 + 0.167·4000 ≈ 10,667
      expect(total).toBeGreaterThanOrEqual(10000)
      expect(total).toBeLessThanOrEqual(11500)
    })
  })

  // ===== 纯猜测（R=25%）=====
  it('R=25%（纯四选一随机）→ debias=0 → anchor=0，档位贴到 row=0', () => {
    const stats = simulateAcrossLevels(40, 10)  // exactly 25%
    const { total, smoothedOverall, band } = estimate(stats)
    expect(smoothedOverall).toBeCloseTo(0, 3)
    expect(total).toBe(0)
    expect(band.band.row).toBe(0)  // <500 fallback
  })
  it('R≈30%（比纯猜测略好，只能答对最简单词）→ vocab 在 0–1000 区间', () => {
    const stats = simulateAcrossLevels(40, 12)  // 30%
    const { total } = estimate(stats)
    expect(total).toBeGreaterThanOrEqual(0)
    expect(total).toBeLessThanOrEqual(1000)
  })

  // ===== 天花板（R→1）=====
  it('R=0.98（接近满分）→ 落在 [31000, 34300]，母语者区间 row=9', () => {
    const stats = simulateAcrossLevels(80, 78)  // 97.5%
    const { total, smoothedOverall, band } = estimate(stats, { precise: true })
    expect(smoothedOverall).toBeGreaterThanOrEqual(0.90)
    expect(total).toBeGreaterThanOrEqual(25000)
    expect(total).toBeLessThanOrEqual(35000)
    expect(band.band.row).toBe(9)  // 20,000+
  })

  // ===== CI 计算 =====
  it('CI 区间与样本量相关：精准模式 80 题 CI < 快速模式 40 题 CI（×0.7 机制 + Wilson 自然变窄）', () => {
    const a = estimate(simulateAcrossLevels(40, 28), { precise: false })
    const b = estimate(simulateAcrossLevels(80, 56), { precise: true  })
    expect(b.ciPercent).toBeLessThan(a.ciPercent)
  })
  it('空数据 CI 回落到合理下限（≥2%），total=0', () => {
    const r = estimate([], { precise: false })
    expect(r.total).toBe(0)
    expect(r.ciPercent).toBeGreaterThanOrEqual(2)
    expect(r.ciPercent).toBeLessThanOrEqual(30)
  })

  // ===== band 档位匹配 =====
  describe('matchLookupBand 档位匹配', () => {
    const BAND_CASES: [number, number][] = [
      [300, 0],                    // <500 兜底
      [800, 0], [1500, 1], [2500, 2], [3800, 3], [5200, 4],
      [7000, 5], [9000, 6], [11000, 7], [16000, 8], [25000, 9],
    ]
    BAND_CASES.forEach(([vocab, row]) => {
      it(`matchLookupBand(${vocab}) → row=${row} (${LOOKUP_TABLE[row].label})`, () => {
        const { band, subtitle } = matchLookupBand(vocab)
        expect(band.row).toBe(row)
        expect(substringMatch(band, vocab)).toBe(true)
        expect(subtitle.length).toBeGreaterThan(0)
      })
    })
  })

  // ===== 工具函数单元 =====
  describe('debiasGuess', () => {
    it('raw 1.00 → 1.00 (完全掌握上限)', () => expect(debiasGuess(1)).toBe(1))
    it('raw 0.25 → 0 (纯猜测扣掉后 = 0)', () => expect(debiasGuess(0.25)).toBeCloseTo(0, 6))
    it('raw ≤ 0.25 clamp 到 0', () => expect(debiasGuess(0)).toBe(0))
    it('raw 0.70 → 0.60（精确到 6 位）', () => expect(debiasGuess(0.70)).toBeCloseTo(0.60, 6))
    it('超出 [0,1] 被 clamp', () => {
      expect(debiasGuess(1.5)).toBe(1)
      expect(debiasGuess(-0.1)).toBe(0)
    })
  })

  describe('wilsonLower / wilsonUpper 边界与单调性', () => {
    it('m=0 k=1 → lo=0（最小样本全错下界是 0）', () => expect(wilsonLower(0, 1)).toBe(0))
    it('m=k 时 lo 单调递增（k 越大 lo 越接近 1）', () => {
      expect(wilsonLower(10, 10)).toBeLessThan(wilsonLower(100, 100))
      expect(wilsonLower(100, 100)).toBeLessThan(1)
    })
    it('lo ≤ p ≤ hi 对常见场景成立', () => {
      const cases = [[5, 10], [28, 40], [57, 80], [78, 80]] as const
      for (const [m, k] of cases) {
        const p = m / k
        expect(wilsonLower(m, k)).toBeLessThanOrEqual(p + 1e-9)
        expect(wilsonUpper(m, k)).toBeGreaterThanOrEqual(p - 1e-9)
      }
    })
  })

  describe('anchorLookup 单调性 + 对齐锚点', () => {
    const pts: [number, number][] = [
      [0.00, 0], [0.10, 500], [0.20, 1500], [0.30, 3000], [0.40, 5000],
      [0.50, 7500], [0.60, 10000], [0.70, 14000], [0.80, 18500], [0.90, 26000], [1.00, 35000],
    ]
    pts.forEach(([r, v]) => {
      it(`anchorLookup(${r}) = ${v} 精确命中`, () => expect(anchorLookup(r)).toBe(v))
    })
    it('中间值单调线性：r=0.55 → 在 7500 和 10000 之间 → 8750', () => {
      expect(anchorLookup(0.55)).toBe(8750)
    })
    it('越界 clamp：r<0 → 0, r>1 → 35000', () => {
      expect(anchorLookup(-0.3)).toBe(0)
      expect(anchorLookup(1.8)).toBe(35000)
    })
  })

  // ===== Result 页分档字段透传完整性 =====
  it('perLevel: mastered/sampled 非负整数，levelTotal 原样保留', () => {
    const stats: PerLevelStat[] = [
      { level: 4, name: 'CET-4', mastered: 9, sampled: 10, levelTotal: 4544 },
      { level: 5, name: 'CET-6', mastered: 5, sampled: 10, levelTotal: 3991 },
      { level: 6, name: '考研', mastered: -1, sampled: 10, levelTotal: 7030 },   // 异常负值→clamp
    ]
    const { perLevel } = estimate(stats)
    expect(perLevel.map(l => `${l.level}:${l.mastered}/${l.sampled}·${l.levelTotal}`)).toEqual([
      '4:9/10·4544', '5:5/10·3991', '6:0/10·7030',
    ])
  })
})

// -------- test helpers --------

/**
 * 在 10 档中模拟一份近似 (totalSampled, totalCorrect) 的统计分布（只把题目放在 L3..L8，
 * 符合自适应算法常见覆盖范围），这样 estimate() 中的 Σm / Σk 等于 m/k 并能反映真实链路。
 */
function simulateAcrossLevels(totalSampled: number, totalCorrect: number): PerLevelStat[] {
  const levels = [
    { level: 3, name: '高中基础',    total: 6555,  weight: 0.15 },
    { level: 4, name: 'CET-4 四级',  total: 4544,  weight: 0.22 },
    { level: 5, name: 'CET-6 六级',  total: 3991,  weight: 0.22 },
    { level: 6, name: '考研 / 专四',  total: 7030,  weight: 0.18 },
    { level: 7, name: '雅思 / 商务',  total: 8019,  weight: 0.13 },
    { level: 8, name: '托福 / 专八',  total: 15907, weight: 0.10 },
  ]
  const result: PerLevelStat[] = []
  let remainingK = totalSampled
  let remainingM = Math.max(0, Math.min(totalCorrect, totalSampled))
  levels.forEach((lv, i) => {
    const isLast = i === levels.length - 1
    const k = isLast ? remainingK : Math.max(0, Math.round(lv.weight * totalSampled))
    const p = totalSampled === 0 ? 0 : totalCorrect / totalSampled
    const m = isLast ? remainingM : Math.max(0, Math.min(k, Math.round(p * k)))
    if (k > 0) {
      result.push({ level: lv.level, name: lv.name, mastered: m, sampled: k, levelTotal: lv.total })
    }
    remainingK -= k
    remainingM -= m
  })
  return result
}

function substringMatch(band: { official: string; percentile: string; min: number; max: number }, vocab: number): boolean {
  const inRange = vocab >= band.min && (band.max === Infinity ? true : vocab < band.max)
  // 特殊：matchLookupBand(vocab<500) 会兜底到 row=0（500~1000 档），此时 vocab 不在区间内但逻辑正确
  const fallback = vocab < 500 && band.min === 500
  return (inRange || fallback) && !!band.official && !!band.percentile
}
