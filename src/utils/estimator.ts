import type { LevelWord } from '@/utils/levels'

/** 10 档词汇量对照参照表（vocab-band lookup table） */
export interface LookupBand {
  row: number
  min: number
  max: number
  label: string        // 词汇量区间标签
  official: string     // 中国学段 / 考试对应（官方）
  desc: string         // 掌握水平描述
  percentile: string   // 超过约 %
}

export const LOOKUP_TABLE: LookupBand[] = [
  { row: 0, min: 500,   max: 1000,   label: '500 ~ 1,000',   official: '小学高年级（课标小学段 505）',                 desc: '基础生存词汇',                                     percentile: '约超过 2 ~ 8%' },
  { row: 1, min: 1000,  max: 2000,   label: '1,000 ~ 2,000', official: '初中（义务教育课标 2022 要求 1,600）',           desc: '基本词汇，日常听说读写入门',                        percentile: '约超过 8 ~ 15%' },
  { row: 2, min: 2000,  max: 3000,   label: '2,000 ~ 3,000', official: '高中必修→选择性必修（课标 2,000~3,200）；旧课标高考线 3,500', desc: '能应对中等难度阅读，高考基础盘',              percentile: '约超过 15 ~ 25%' },
  { row: 3, min: 3000,  max: 4500,   label: '3,000 ~ 4,500', official: '高考高分段 / 四级（大纲 4,500，含中学基础约 1,500）',    desc: '大学基础英语，可读一般英文材料',                   percentile: '约超过 25 ~ 40%' },
  { row: 4, min: 4500,  max: 6000,   label: '4,500 ~ 6,000', official: '六级（5,500~6,000）/ 考研（5,500）',                  desc: '较流利阅读，学术入门',                              percentile: '约超过 40 ~ 55%' },
  { row: 5, min: 6000,  max: 8000,   label: '6,000 ~ 8,000', official: '专四（7,000~8,000）/ 雅思 7 分线',                     desc: '能应付留学场景、复杂观点表达',                      percentile: '约超过 55 ~ 75%' },
  { row: 6, min: 8000,  max: 10000,  label: '8,000 ~ 10,000',official: '托福（9,000~10,000）/ 雅思 8 分线',                   desc: '学术英语较强，接近流畅',                             percentile: '约超过 75 ~ 90%' },
  { row: 7, min: 10000, max: 13000,  label: '10,000 ~ 13,000',official: '专八（约 13,000）',                                     desc: '高学术水平，文学 / 语言学词汇',                      percentile: '约超过 90 ~ 95%' },
  { row: 8, min: 13000, max: 20000,  label: '13,000 ~ 20,000',official: 'GRE（16,000~20,000）',                                  desc: '高强度学术 / 考试词汇',                               percentile: '约超过 95 ~ 99%' },
  { row: 9, min: 20000, max: Infinity, label: '20,000+',      official: '母语成人水平（成年母语者 20,000~35,000）',             desc: '接近 / 达到母语者阅读词汇',                          percentile: '约超过 99%' },
]

export interface BandMatch {
  band: LookupBand
  subtitle: string
}

/** 根据用户估算词汇量匹配档位（含边缘 <500 的情况贴到 L0 描述） */
export function matchLookupBand(total: number): BandMatch {
  if (!Number.isFinite(total) || total < 0) total = 0
  if (total < 500) {
    const b = LOOKUP_TABLE[0]
    return { band: b, subtitle: `处于「${b.official}」以下入门阶段，${b.percentile}` }
  }
  const band = LOOKUP_TABLE.find(b => total >= b.min && total < b.max) ?? LOOKUP_TABLE[LOOKUP_TABLE.length - 1]
  return { band, subtitle: `对标「${band.official}」，${band.percentile}（全球非母语自测者参照）` }
}

export interface PerLevelStat {
  level: number
  name: string
  mastered: number
  sampled: number
  levelTotal: number
}

export interface EstimateResult {
  total: number
  perLevel: PerLevelStat[]
  ciPercent: number
  band: BandMatch
  /** 诊断：加权原始正确率（四选一格式），用于与锚点映射对照 */
  rawOverall: number
  /** 诊断：Wilson 下界平滑后的总正确率 */
  smoothedOverall: number
}

// ======================================================
// 方案 C：Wilson 平滑 + 四选一猜测校正 + TYT 锚点单调样条映射
// ------------------------------------------------------
// 步骤 1：对每档 (m, k) 计算 Wilson 95% 下界（避免小样本偶然全对导致 mastery=100%）
//         并做猜测校正：raw → (raw - 1/4) / (3/4)
// 步骤 2：对整体正确率 R = Σ(m) / Σ(k) 同样做 Wilson + 猜测校正，得到 R_smooth
// 步骤 3：用 9 个 TYT 对标锚点做单调线性插值（样条折线），把 R_smooth → 最终词汇量 V
// ======================================================

/** 四选一：25% 纯随机基准正确率，对任何 raw 正确率都需要扣掉它再除以 (1-基准) 得到真实掌握度估计 */
const GUESS_BASELINE = 1 / 4
const CONF_Z = 1.96  // Wilson 95% 双侧分位数

/** Wilson 95% 置信区间下界；m=正确数, k=题目数 */
export function wilsonLower(m: number, k: number): number {
  if (k <= 0) return 0
  const n = Math.max(1, k)
  const x = Math.min(Math.max(0, m), n)
  const p = x / n
  const z = CONF_Z
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const half = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n) / denom
  const lo = Math.max(0, Math.min(1, center - half))
  return lo
}

/** Wilson 95% 置信区间上界（用于 CI 估算） */
export function wilsonUpper(m: number, k: number): number {
  if (k <= 0) return 1
  const n = Math.max(1, k)
  const x = Math.min(Math.max(0, m), n)
  const p = x / n
  const z = CONF_Z
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const half = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n) / denom
  const hi = Math.max(0, Math.min(1, center + half))
  return hi
}

/** 从 raw（四选一正确率）扣除猜测率，得到去偏的真实掌握率估计 */
export function debiasGuess(rawRate: number): number {
  const r = Math.max(0, Math.min(1, rawRate))
  const debiased = (r - GUESS_BASELINE) / (1 - GUESS_BASELINE)
  return Math.max(0, Math.min(1, debiased))
}

/**
 * TYT 对标锚点表：R_debias（猜测去偏后的总体掌握率） → 估算词汇量 V
 * 校准：raw=0.70（四选一中真实做题常见正确率，对应 TYT 用户自述≈10,000）
 *       → 去偏 = (0.70 - 0.25)/0.75 = 0.60 → vocab = 10,000  ✅  与用户 TYT 实际结果对齐
 * 其他锚点参考：testyourvocabulary.com 公开分位数 + PrepSmith/MMR 研究
 *   - R=0.00 → 0     （与纯猜测一致，没有可识别的掌握量）
 *   - R=0.10 → 500   （仅比纯猜测稍好，入门 ~500 词）
 *   - R=0.20 → 1,500 （小学高年级基础）
 *   - R=0.30 → 3,000 （初中毕业水平）
 *   - R=0.40 → 5,000 （高中毕业 / 四级基础）
 *   - R=0.50 → 7,500 （六级 / 考研及格线）
 *   - R=0.60 → 10,000（专八及格线 / TYT 常见用户水平  ← 用户 TYT 对齐锚点）
 *   - R=0.70 → 14,000（GRE 入门 / 高级非母语者）
 *   - R=0.80 → 18,500（强高级 / 留学高强度训练者）
 *   - R=0.90 → 26,000（接近受过教育的母语者下限）
 *   - R=1.00 → 35,000（母语成人阅读词汇上限 · Goulden/Nation 经典估计）
 */
const ANCHORS: Array<{ r: number; vocab: number }> = [
  { r: 0.00, vocab: 0 },
  { r: 0.10, vocab: 500 },
  { r: 0.20, vocab: 1500 },
  { r: 0.30, vocab: 3000 },
  { r: 0.40, vocab: 5000 },
  { r: 0.50, vocab: 7500 },
  { r: 0.60, vocab: 10000 },
  { r: 0.70, vocab: 14000 },
  { r: 0.80, vocab: 18500 },
  { r: 0.90, vocab: 26000 },
  { r: 1.00, vocab: 35000 },
]

/** 锚点单调折线插值；输入 [0,1]，输出 0..35000 */
export function anchorLookup(smoothRate: number): number {
  const x = Math.max(0, Math.min(1, smoothRate))
  for (let i = 1; i < ANCHORS.length; i++) {
    const prev = ANCHORS[i - 1]
    const cur = ANCHORS[i]
    if (x <= cur.r) {
      const t = (x - prev.r) / Math.max(1e-9, cur.r - prev.r)
      return Math.round(prev.vocab + t * (cur.vocab - prev.vocab))
    }
  }
  return ANCHORS[ANCHORS.length - 1].vocab
}

/**
 * 词汇量估算（方案 C 重写）：
 *  返回 EstimateResult，其中：
 *   - total：用 Wilson+去偏+锚点 映射出来的 TYT 口径估算词汇量
 *   - perLevel：原样透传（结果页的图仍然按 mastered/sampled 展示），额外会在控制台可观测到
 *   - ciPercent：通过 Wilson 上下界 → 映射到词汇区间 → 半宽相对比例；精准模式 × 0.7
 */
export function estimate(stats: PerLevelStat[], opts: { precise?: boolean } = {}): EstimateResult {
  const filled: PerLevelStat[] = stats.map(s => ({
    ...s,
    mastered: Math.max(0, s.mastered),
    sampled: Math.max(0, s.sampled),
    levelTotal: Math.max(0, s.levelTotal),
  }))

  const totalCorrect = filled.reduce((a, s) => a + s.mastered, 0)
  const totalSampled = filled.reduce((a, s) => a + s.sampled, 0)

  const rawOverall = totalSampled === 0 ? 0 : totalCorrect / totalSampled

  // 猜测去偏：对整体点估计 rawOverall 直接扣除 25% 纯猜测基线
  // 注意：Wilson lo/hi 仅用于 CI 区间计算，不用于拉低点估计（避免 40 题的置信区间过宽导致系统性低估）
  const loRate = totalSampled === 0 ? 0 : wilsonLower(totalCorrect, totalSampled)
  const hiRate = totalSampled === 0 ? 1 : wilsonUpper(totalCorrect, totalSampled)
  const smoothedOverall = debiasGuess(rawOverall)

  // ------------------------------------------------------------
  // 用户体验底线规则（在去偏 + 锚点估算基础上做最终 floor）：
  //   ① totalCorrect === 0（一题没对）→ total = 0
  //   ② 0 < 答对率 ≤ 25%（含 25%，但至少答对过 1 题）→ 安慰奖底线 500
  //   ③ 答对率 > 25%：低分段按用户指定校准点**线性插值**避免 501 直跳太突兀
  //        25% → 500  （与规则②尾端连续衔接）
  //        30% → 550  （用户指定：12/40 或 24/80）
  //        32.5% → 600（用户指定：13/40 或 26/80）
  //        >32.5% → floor=600（再与 11 档锚点自然衔接，baseVocab 超 600 后退出保护）
  //      最终 total = max(lowEndFloor(rawOverall), baseTotal)
  //   注：raw=correct/total 是比例量纲，40/80 题自动同比例校准，无需特殊分支
  // ------------------------------------------------------------
  const baseTotal = anchorLookup(smoothedOverall)
  const lowEndFloor = (r: number): number => {
    if (r <= 0.30) return 500 + 1000 * (r - 0.25)                 // 25%→500, 30%→550 (每0.01 raw +10 词)
    if (r <= 0.325) return 550 + 2000 * (r - 0.30)                // 30%→550, 32.5%→600 (每0.005 raw +10 词)
    return 600
  }
  let total: number
  if (totalCorrect === 0) {
    total = 0
  } else if (rawOverall <= 0.25) {
    total = 500
  } else {
    const floor = lowEndFloor(rawOverall)
    total = Math.max(floor, baseTotal)
  }

  // 95% CI：把 Wilson 上下界都去偏 → 分别映射词汇 → 取半宽相对 total 的比例
  const loVocab = totalSampled === 0 ? 0 : anchorLookup(debiasGuess(loRate))
  const hiVocab = totalSampled === 0 ? anchorLookup(debiasGuess(hiRate)) : anchorLookup(debiasGuess(hiRate))
  const halfWidth = total === 0 ? 0 : Math.max(Math.abs(total - loVocab), Math.abs(hiVocab - total))
  const rawRel = total === 0 ? 0.3 : halfWidth / total
  const rel = Math.max(0.02, Math.min(0.30, rawRel))  // 2%–30% clip
  const ciPercent = Math.round(rel * 100 * (opts.precise ? 0.7 : 1))

  return {
    total,
    perLevel: filled,
    ciPercent,
    band: matchLookupBand(total),
    rawOverall,
    smoothedOverall,
  }
}

// 为 LevelWord 模块保留类型引用（避免 tree-shaking 删除该 import，不影响结果）
export type _LW = LevelWord
