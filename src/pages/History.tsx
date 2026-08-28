import PageShell from '@/components/PageShell'
import { LOOKUP_TABLE, matchLookupBand } from '@/utils/estimator'
import { useStorage, type QuizRecord } from '@/hooks/useStorage'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const SESSION_KEY = 'vocab-result-json'

export default function History() {
  const storage = useStorage()
  const [records, setRecords] = useState<QuizRecord[]>(() => storage.getHistory())

  useEffect(() => {
    setRecords(storage.getHistory())
  }, [storage])

  function viewDetail(r: QuizRecord) {
    // 把记录推入 sessionStorage → Result 页读取展示
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(r)) } catch {}
  }

  if (records.length === 0) {
    return (
      <PageShell title="历史记录" subtitle="最近 20 次本地保存的测试结果">
        <div className="mt-10 rounded-2xl border border-dashed border-[rgb(var(--line))] p-10 text-center">
          <div className="text-3xl">📖</div>
          <p className="mt-3 text-[rgb(var(--muted))]">还没有保存的记录。完成一次测试后，在结果页点击「保存到历史记录」即可。</p>
          <Link to="/" className="mt-5 inline-flex items-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 shadow-card">
            现在开始第一次测试
          </Link>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="历史记录"
      subtitle={`共 ${records.length} 条 · 仅保存在你本机浏览器（localStorage）`}
      action={
        <button
          type="button"
          onClick={() => { if (confirm('确定要清空全部历史记录吗？此操作不可恢复。')) { storage.clearHistory(); setRecords([]) } }}
          className="inline-flex h-9 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-200"
          data-testid="btn-clear-all"
        >清空全部</button>
      }
    >
      <section className="mt-8 grid gap-4">
        {records.map((r, idx) => {
          const band = matchLookupBand(r.totalVocab)
          return (
            <article
              key={r.id + '-' + idx}
              data-testid="history-card"
              className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-5 sm:p-6 shadow-card"
            >
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center rounded-full bg-brand-500 text-white text-xs px-2.5 py-0.5 font-semibold">
                      {r.mode === 'fast' ? '快速模式' : '精准模式'}
                    </span>
                    <span className="text-xs text-[rgb(var(--muted))] numeric">{new Date(r.date).toLocaleString()}</span>
                    <span className="text-xs rounded-full bg-white/70 dark:bg-slate-800 border border-[rgb(var(--line))] px-2 py-0.5 text-[rgb(var(--muted))] numeric">
                      覆盖档位：{Array.isArray(r.perLevel) ? r.perLevel.filter(l => l.sampled > 0).length : 0}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <div className="text-3xl font-extrabold tracking-tight numeric">{r.totalVocab.toLocaleString()}</div>
                    <div className="text-sm text-[rgb(var(--muted))]">词 · ±5%</div>
                  </div>
                  <p className="mt-1 text-sm font-semibold" data-testid="hist-official">{band.band.official}</p>
                  <p className="mt-0.5 text-xs text-[rgb(var(--muted))] leading-5" data-testid="hist-subtitle">{band.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    onClick={() => viewDetail(r)}
                    to="/result"
                    className="inline-flex items-center rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 shadow-card"
                    data-testid="btn-view"
                  >📋 查看报告</Link>
                  <Link
                    to={`/quiz?mode=${r.mode}`}
                    className="inline-flex items-center rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-3 py-2 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
                  >🔁 再测一次（{r.mode === 'fast' ? '快速' : '精准'}）</Link>
                  <button
                    type="button"
                    onClick={() => { storage.deleteRecord(r.id); setRecords(storage.getHistory()) }}
                    data-testid="btn-del"
                    className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-200"
                  >🗑️ 删除</button>
                </div>
              </div>

              {/* 10 档迷你对照表，仅显示有 sampled 的档，其余折叠 */}
              <div className="mt-5 overflow-hidden rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--bg))]/60">
                <div className="grid grid-cols-12 px-3 py-1.5 text-[11px] font-semibold text-[rgb(var(--muted))] border-b border-[rgb(var(--line))]">
                  <div className="col-span-1">档</div>
                  <div className="col-span-4 sm:col-span-5">名称</div>
                  <div className="col-span-3 sm:col-span-2 text-right">抽样/掌握</div>
                  <div className="col-span-4 text-right">掌握比例</div>
                </div>
                <ul className="divide-y divide-[rgb(var(--line))]/70">
                  {(Array.isArray(r.perLevel) && r.perLevel.length ? r.perLevel : LOOKUP_TABLE.map((row, i) => ({
                    level: row.row + 1, name: ['小学入门', '初中基础', '高中基础', 'CET-4 四级', 'CET-6 六级', '考研 / 专四', '雅思 / GMAT / 商务', '托福 / 专八', 'SAT', 'GRE'][i] ?? `L${row.row + 1}`,
                    mastered: 0, sampled: 0, levelTotal: 0, unknown: [],
                  }))).map(l => {
                    const pct = l.sampled ? Math.round(l.mastered / l.sampled * 100) : 0
                    const has = l.sampled > 0
                    return (
                      <li key={l.level} className="grid grid-cols-12 gap-1 px-3 py-1.5 text-sm items-center">
                        <div className="col-span-1">
                          <span className={'rounded-full px-1.5 text-[11px] font-medium ' + (has ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200' : 'text-[rgb(var(--muted))] bg-transparent')}>L{l.level}</span>
                        </div>
                        <div className={'col-span-4 sm:col-span-5 truncate ' + (has ? '' : 'text-[rgb(var(--muted))]')}>{l.name}</div>
                        <div className="col-span-3 sm:col-span-2 text-right numeric text-xs">
                          <span className="text-emerald-600 dark:text-emerald-400">{l.mastered}</span>
                          <span className="text-[rgb(var(--muted))]">/{l.sampled}</span>
                        </div>
                        <div className="col-span-4 flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-[rgb(var(--line))]">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: pct + '%' }} />
                          </div>
                          <span className="w-9 shrink-0 text-right text-xs numeric text-[rgb(var(--muted))]">{pct}%</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </article>
          )
        })}
      </section>
    </PageShell>
  )
}
