import PageShell from '@/components/PageShell'
import { LOOKUP_TABLE, matchLookupBand } from '@/utils/estimator'
import type { QuizResult } from '@/hooks/useQuizEngine'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStorage } from '@/hooks/useStorage'
import html2canvas from 'html2canvas'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const SESSION_KEY = 'vocab-result-json'
const WECHAT_ID_PLACEHOLDER = 'VocabTest-Official'

export default function Result() {
  const nav = useNavigate()
  const storage = useStorage()
  const [result, setResult] = useState<QuizResult | null>(null)
  const [saveMsg, setSaveMsg] = useState<string>('')
  const shareCardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as QuizResult
        // 基本字段校验
        if (typeof parsed.totalVocab === 'number' && Array.isArray(parsed.perLevel)) {
          setResult(parsed)
          return
        }
      }
    } catch {}
    // 没有结果：为了页面可直接打开演示，构建一个示例数据
    setResult(buildDemoResult())
  }, [])

  const band = useMemo(() => matchLookupBand(result?.totalVocab ?? 0), [result])
  const unknownAll = useMemo(() => result?.perLevel.flatMap(l => l.unknown) ?? [], [result])
  const sampledTotal = useMemo(() => result?.perLevel.reduce((a, l) => a + l.sampled, 0) ?? 0, [result])
  const masteredTotal = useMemo(() => result?.perLevel.reduce((a, l) => a + l.mastered, 0) ?? 0, [result])

  // ======= 导出功能 =======
  const saveToHistory = () => {
    if (!result) return
    storage.saveRecord(result)
    setSaveMsg('已保存到本地历史记录')
    setTimeout(() => setSaveMsg(''), 2500)
  }
  const downloadTxt = () => {
    if (!result) return
    const lines: string[] = [
      `# VocabTest 未掌握词 · ${new Date(result.date).toLocaleString()}`,
      `# 模式: ${result.mode === 'fast' ? '快速 40 题' : '精准 80 题'}  估算词汇量: ${result.totalVocab} ±${result.ci}%`,
      '',
      '# 格式: 单词 | 释义 | 档位',
      ...unknownAll.map(u => `${u.word} | ${u.tran} | L${u.level}`),
    ]
    triggerDownload('未掌握词-' + result.id + '.txt', lines.join('\n'), 'text/plain;charset=utf-8')
  }
  const downloadSharePng = async () => {
    const el = shareCardRef.current
    if (!el || !result) return
    try {
      const cv = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true })
      const url = cv.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `词汇量-${result.totalVocab}-${result.id}.png`
      document.body.appendChild(a); a.click(); a.remove()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('生成分享图失败：', e)
      alert('生成分享图失败，可使用浏览器右键「截图」代替')
    }
  }

  return (
    <PageShell
      title="测试结果"
      subtitle={result ? `完成 ${result.done}/${result.total} 题 · 共抽样 ${sampledTotal} 个，掌握 ${masteredTotal} 个（${Math.round(masteredTotal / Math.max(1, sampledTotal) * 100)}%）` : '正在读取…'}
    >
      {!result
        ? <div className="py-10 text-center text-[rgb(var(--muted))]">正在加载测试结果…</div>
        : (
          <div className="mt-8 space-y-8">
            {/* 模块 1：主卡 + 词汇量 + 对照行 + 微信二维码占位 */}
            <section data-testid="module-hero" className="grid gap-6 lg:grid-cols-3">
              <div ref={shareCardRef} className="lg:col-span-2 rounded-2xl border border-[rgb(var(--line))] bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/30 dark:to-slate-900 p-6 sm:p-8 shadow-card">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-[rgb(var(--muted))]">{result.mode === 'fast' ? '快速模式' : '精准模式'} · {new Date(result.date).toLocaleString()}</div>
                  <div className="text-sm font-semibold text-brand-700 dark:text-brand-200">VocabTest · 你的词汇量报告</div>
                </div>
                <div className="mt-4 grid sm:grid-cols-[auto_1fr] gap-6 items-center">
                  <div>
                    <div className="text-sm text-[rgb(var(--muted))]">你的英语词汇量约为</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <div className="text-5xl sm:text-6xl font-extrabold tracking-tight numeric" data-testid="result-total">{result.totalVocab.toLocaleString()}</div>
                      <div className="text-lg font-medium text-[rgb(var(--muted))]">词</div>
                    </div>
                    <div className="mt-2 text-sm text-[rgb(var(--muted))]">
                      估算置信区间 ±<span className="numeric text-[rgb(var(--fg))] font-medium">{result.ci}%</span>
                    </div>
                  </div>
                  <div>
                    <div className="inline-flex items-center rounded-full bg-white/80 dark:bg-slate-800/80 border border-[rgb(var(--line))] px-3 py-1 text-xs font-semibold text-brand-700 dark:text-brand-200" data-testid="result-band-label">
                      {band.band.label} 档
                    </div>
                    <p className="mt-2 text-base font-semibold" data-testid="result-band-official">{band.band.official}</p>
                    <p className="mt-1 text-sm leading-6 text-[rgb(var(--fg))]/90" data-testid="result-band-subtitle">{band.subtitle}</p>
                    <p className="mt-1 text-xs text-[rgb(var(--muted))]">{band.band.percentile}；{band.band.desc}</p>
                  </div>
                </div>

                {/* 10 档对照表：高亮匹配档 */}
                <div className="mt-6 overflow-hidden rounded-xl border border-[rgb(var(--line))] bg-white/60 dark:bg-slate-900/60">
                  <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-[rgb(var(--muted))] bg-[rgb(var(--bg))]/50 border-b border-[rgb(var(--line))]">
                    <div className="col-span-3">词汇量区间</div>
                    <div className="col-span-6">对标（官方 / 考试）</div>
                    <div className="col-span-3 text-right">参考百分位</div>
                  </div>
                  <ul className="max-h-72 overflow-auto" data-testid="lookup-table">
                    {LOOKUP_TABLE.map(row => {
                      const active = row.row === band.band.row
                      return (
                        <li
                          key={row.row}
                          data-testid={`lookup-row-${row.row}`}
                          className={
                            'grid grid-cols-12 px-4 py-2.5 text-sm border-b border-[rgb(var(--line))]/60 last:border-b-0 ' +
                            (active
                              ? 'bg-brand-500 text-white'
                              : 'hover:bg-[rgb(var(--bg))]/50')
                          }
                        >
                          <div className="col-span-3 font-semibold numeric">{row.label}</div>
                          <div className={'col-span-6 ' + (active ? '' : 'text-[rgb(var(--fg))]/90')}>{row.official}</div>
                          <div className={'col-span-3 text-right ' + (active ? '' : 'text-[rgb(var(--muted))]')}>{row.percentile}</div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>

              {/* 微信二维码占位 */}
              <aside data-testid="module-wechat" className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 shadow-card flex flex-col items-center text-center">
                <h3 className="text-base font-semibold">领取专属学习包 🎁</h3>
                <p className="mt-2 text-sm text-[rgb(var(--muted))] leading-6">扫码 / 复制下方微信号，发送「<b className="text-brand-700 dark:text-brand-200">词汇量 {result.totalVocab}</b>」，立即获取：</p>
                <ul className="mt-3 space-y-1 text-sm leading-6 text-left">
                  <li>📚 按你档位定制的 <b>100 核心词 + 500 高频扩展词</b> PDF</li>
                  <li>🗓️ <b>21 天背词计划</b>（含遗忘曲线复盘）</li>
                  <li>🖨️ 可打印默写纸（同本页「导出默写 TXT」格式）</li>
                  <li>🎧 真人发音 MP3 + 英剧例句包</li>
                </ul>
                {/* 二维码占位图：使用占位框 + 可替换说明 */}
                <div className="mt-5 w-[220px] h-[220px] rounded-xl border-2 border-dashed border-[rgb(var(--line))] grid place-items-center bg-[rgb(var(--bg))]/40 relative overflow-hidden" data-testid="wechat-qr-placeholder">
                  <span className="text-center text-sm text-[rgb(var(--muted))] leading-6 px-4">
                    微信二维码占位<br />替换为你的专属二维码 PNG<br />（220×220 透明）
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-[rgb(var(--muted))]">微信 ID：</span>
                  <code className="rounded-md bg-[rgb(var(--bg))] px-2 py-0.5 text-[rgb(var(--fg))] select-all" data-testid="wechat-id">{WECHAT_ID_PLACEHOLDER}</code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard?.writeText(WECHAT_ID_PLACEHOLDER).then(() => setSaveMsg('微信号已复制，去微信加好友吧')); setTimeout(() => setSaveMsg(''), 2500) }}
                    className="text-xs rounded-md border border-[rgb(var(--line))] px-2 py-0.5 text-[rgb(var(--muted))] hover:text-brand-600 hover:border-brand-400"
                  >复制</button>
                </div>
              </aside>
            </section>

            {/* 模块 2：10 档分档明细 + 条形图 */}
            <section data-testid="module-breakdown" className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 sm:p-8 shadow-card">
              <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-xl font-bold">分档诊断</h3>
                  <p className="mt-1 text-sm text-[rgb(var(--muted))]">浅灰 = 抽样题数，深绿 = 掌握数；每档 mastery × 该档总词数 = 你的估算词汇量。</p>
                </div>
                <div className="text-xs text-[rgb(var(--muted))]">共 {result.perLevel.reduce((a, l) => a + l.sampled, 0)} 个抽样 · 覆盖 {result.perLevel.filter(l => l.sampled > 0).length} 个档位</div>
              </div>

              <div className="mt-6 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.perLevel.map(l => ({ name: `L${l.level}`, 抽样: l.sampled, 掌握: l.mastered, level: l.level }))}>
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="抽样" fill="rgb(var(--line))" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="掌握" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <ul className="mt-6 divide-y divide-[rgb(var(--line))]" data-testid="per-level-list">
                {result.perLevel.map(l => {
                  const mastery = l.sampled ? Math.round(l.mastered / l.sampled * 100) : 0
                  return (
                    <li key={l.level} className="grid grid-cols-12 gap-2 items-center py-3">
                      <div className="col-span-2 sm:col-span-1">
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">L{l.level}</span>
                      </div>
                      <div className="col-span-4 sm:col-span-4 text-sm truncate">{l.name}</div>
                      <div className="col-span-6 sm:col-span-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgb(var(--line))]">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: l.sampled ? Math.round(l.mastered / l.sampled * 100) + '%' : '0%' }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-xs numeric text-[rgb(var(--muted))]">{mastery}%</span>
                        </div>
                      </div>
                      <div className="col-span-6 sm:col-span-3 text-sm text-[rgb(var(--fg))]/90 text-right sm:text-right">
                        <span className="numeric">{l.mastered}</span> / <span className="numeric">{l.sampled}</span>
                        <span className="text-[rgb(var(--muted))] mx-1">·</span>
                        词库 <span className="numeric">{l.levelTotal.toLocaleString()}</span>
                      </div>
                      <div className="col-span-6 sm:col-span-1 text-right">
                        {l.unknown.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-200">未掌握 {l.unknown.length}</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* 模块 4：操作区（保存 / 导出 / 再测） */}
            <section data-testid="module-actions" className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 sm:p-8 shadow-card">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                  <h3 className="text-lg font-bold">下一步</h3>
                  <p className="mt-1 text-sm text-[rgb(var(--muted))] leading-6">保存报告、下载分享卡，或把你没掌握的词打印出来默写复习。</p>
                  {saveMsg && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-300" role="status">{saveMsg}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={saveToHistory}
                    data-testid="btn-save-history"
                    className="inline-flex items-center rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-4 py-2.5 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
                  >💾 保存到历史记录</button>
                  <Link
                    to="/history"
                    className="inline-flex items-center rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-4 py-2.5 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
                  >📖 查看历史记录</Link>
                  <button
                    onClick={downloadSharePng}
                    data-testid="btn-png"
                    className="inline-flex items-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 shadow-card"
                  >📸 下载 PNG 分享卡</button>
                  <button
                    onClick={downloadTxt}
                    data-testid="btn-txt"
                    className={
                      'inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-medium shadow-card ' +
                      (unknownAll.length === 0
                        ? 'bg-[rgb(var(--bg))] text-[rgb(var(--muted))] cursor-not-allowed border border-[rgb(var(--line))]'
                        : 'bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white')
                    }
                    disabled={unknownAll.length === 0}
                  >📝 导出未掌握词 TXT（{unknownAll.length}）</button>
                  <Link
                    to="/dictation"
                    state={{ unknown: unknownAll }}
                    className="inline-flex items-center rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-4 py-2.5 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
                  >🖨️ 打开默写页</Link>
                  <button
                    onClick={() => { nav('/'); window.scrollTo({ top: 0 }) }}
                    className="inline-flex items-center rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-4 py-2.5 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
                  >🏠 回到首页</button>
                  <Link
                    to={`/quiz?mode=${result.mode}`}
                    className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 shadow-card"
                  >🔁 再测一次（{result.mode === 'fast' ? '快速' : '精准'}）</Link>
                </div>
              </div>
            </section>
          </div>
        )}
    </PageShell>
  )
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** 示例数据：用于直接打开 /result 时的兜底演示（totalVocab 6200 → 6000~8000 档 row=5） */
function buildDemoResult(): QuizResult {
  const names = ['小学入门', '初中基础', '高中基础', 'CET-4 四级', 'CET-6 六级', '考研 / 专四', '雅思 / GMAT / 商务', '托福 / 专八', 'SAT', 'GRE']
  // 演示：L4 6/10, L5 3/10 → 与 TR-2.4 一致 (估算 6200)
  const totals = [1500, 2100, 3200, 7508, 5651, 8000, 9000, 13000, 15000, 20000]
  const levels: QuizResult['perLevel'] = names.map((name, i) => {
    const lvl = i + 1
    if (lvl === 4) return { level: 4, name, mastered: 6, sampled: 10, levelTotal: totals[3], unknown: [{ word: 'ability-x', tran: '能力；才能（示例）', level: 4 }] }
    if (lvl === 5) return { level: 5, name, mastered: 3, sampled: 10, levelTotal: totals[4], unknown: [{ word: 'ample-y', tran: '充足的（示例）', level: 5 }, { word: 'boost-y', tran: '促进；增强（示例）', level: 5 }] }
    return { level: lvl, name, mastered: 0, sampled: 0, levelTotal: totals[i], unknown: [] }
  })
  return {
    id: 'R-demo',
    mode: 'fast',
    date: Date.now(),
    done: 20,
    total: 40,
    perLevel: levels,
    totalVocab: Math.round(0.6 * 7508 + 0.3 * 5651),
    ci: 8,
  }
}
