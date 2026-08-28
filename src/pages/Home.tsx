import PageShell from '@/components/PageShell'
import { Link } from 'react-router-dom'
import { useState } from 'react'

export default function Home() {
  const [mode, setMode] = useState<'fast' | 'precise'>('fast')

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
            <li className="flex gap-2"><span className="text-brand-600">①</span> 看到单词后，判断自己是否「认识」</li>
            <li className="flex gap-2"><span className="text-brand-600">②</span> 不确定请选「不认识」，避免虚高</li>
            <li className="flex gap-2"><span className="text-brand-600">③</span> 认识的单词会出现 4 选 1 释义题，需要答对才算掌握</li>
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
          <ul className="mt-5 space-y-3 text-sm leading-6">
            <li>📊 <b>10 档分层抽样</b>：覆盖小学 → GRE，总量 64,000+ 去重词条</li>
            <li>🎯 <b>双关卡判题</b>：先自判「认识/不认识」+ 4 选 1 释义校验，结果不虚高</li>
            <li>🧭 <b>对照表对标课标</b>：高考线 / 四六级 / 专四专八 / 雅思托福百分位一目了然</li>
            <li>📤 <b>PNG 分享卡 + 默写纸</b>：截图发朋友圈；未掌握单词一键导出 TXT 可打印默写</li>
            <li>🔒 <b>100% 本地</b>：零后端，结果只存你自己的浏览器</li>
          </ul>
        </div>
      </section>
    </PageShell>
  )
}
