import PageShell from '@/components/PageShell'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { BookOpenCheck, BrainCircuit, BarChart3, GraduationCap, type LucideIcon } from 'lucide-react'

export default function Home() {
  const [mode, setMode] = useState<'fast' | 'precise'>('fast')

  const highlights: Array<{ icon: LucideIcon; title: string; desc: string; tone: string }> = [
    {
      icon: BookOpenCheck,
      title: '词库权威',
      desc: '源自 23 本主流教材与考试词书，去重 6.4 万 + 词条，覆盖小学 → GRE 全部难度',
      tone: 'from-sky-500/10 to-sky-500/0 text-sky-600 dark:text-sky-300',
    },
    {
      icon: BrainCircuit,
      title: '自适应出题',
      desc: '系统随你的水平自动升 / 降难度，不刁难也不放水',
      tone: 'from-fuchsia-500/10 to-fuchsia-500/0 text-fuchsia-600 dark:text-fuchsia-300',
    },
    {
      icon: BarChart3,
      title: '统计估算',
      desc: '10 档分层抽样 + 猜测去偏 + 置信区间，用科学样本算出你的真实词汇量',
      tone: 'from-emerald-500/10 to-emerald-500/0 text-emerald-600 dark:text-emerald-300',
    },
    {
      icon: GraduationCap,
      title: '直接对标考试',
      desc: '高考 / 四六级 / 专四专八 / 雅思托福百分位一键对照',
      tone: 'from-amber-500/10 to-amber-500/0 text-amber-600 dark:text-amber-300',
    },
  ]

  return (
    <PageShell
      title="你的英语词汇量有多少？"
      subtitle="3–5 分钟完成估算，对照课标与考试线分级诊断。"
    >
      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 shadow-card">
          <div role="tablist" aria-label="测试模式" className="grid grid-cols-2 rounded-xl bg-white/60 dark:bg-slate-900/60 p-1 border border-[rgb(var(--line))]">
            {(['fast', 'precise'] as const).map(m => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={
                  'rounded-lg py-2 text-sm font-medium transition ' +
                  (mode === m
                    ? 'bg-brand-500 text-white shadow'
                    : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]')
                }
              >
                {m === 'fast' ? '快速模式 · ≈ 40 题' : '精准模式 · ≈ 80 题'}
              </button>
            ))}
          </div>

          <ul className="mt-5 space-y-3 text-sm leading-6 text-[rgb(var(--fg))]/90">
            <li className="flex gap-2"><span className="text-brand-600">①</span> 认识的单词会出现 4 选 1 释义题，需要答对才算掌握</li>
          </ul>

          <Link
            to={`/quiz?mode=${mode}`}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-base font-semibold text-white shadow-card hover:bg-brand-600 active:translate-y-px transition"
            data-testid="start-btn"
          >
            开始测试 →
          </Link>
          <p className="mt-3 text-center text-xs text-[rgb(var(--muted))]">
            {mode === 'fast' ? '约 3 分钟' : '约 5 分钟'}
          </p>
        </div>

        <div className="rounded-2xl border border-[rgb(var(--line))] bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/30 dark:to-slate-900 p-6 shadow-card">
          <h2 className="text-lg font-semibold rule">测试亮点</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {highlights.map(({ icon: Icon, title, desc, tone }) => (
              <li
                key={title}
                className="group flex items-start gap-3 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))]/70 p-4 hover:border-brand-400/60 hover:shadow-sm transition"
              >
                <div className={`shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br ${tone} shadow-inner`}>
                  <Icon className="w-5 h-5" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[rgb(var(--fg))] leading-5">{title}</h3>
                  <p className="mt-1 text-[13px] leading-5 text-[rgb(var(--muted))]">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </PageShell>
  )
}
