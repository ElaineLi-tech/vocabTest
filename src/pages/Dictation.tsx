import PageShell from '@/components/PageShell'
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

interface UnknownItem { word: string; tran: string; level?: number }

export default function Dictation() {
  const { state } = useLocation() as { state?: { unknown?: UnknownItem[] } | null }
  const list: UnknownItem[] = useMemo(() => {
    const arr = (state as any)?.unknown
    if (Array.isArray(arr)) return arr
    // 兜底：最近的 sessionStorage 的 result 也可以作为输入
    try {
      const raw = sessionStorage.getItem('vocab-result-json')
      if (raw) {
        const parsed = JSON.parse(raw) as any
        const all: UnknownItem[] = (parsed.perLevel ?? []).flatMap((l: any) => (l.unknown ?? []))
        if (all.length) return all
      }
    } catch {}
    return []
  }, [state])

  return (
    <PageShell
      title="默写纸"
      subtitle={`共 ${list.length} 个未掌握词 · 左边中文释义，右边留空给你写英文；点击「打印」即可导出 PDF`}
      action={
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => window.print()} className="h-9 inline-flex items-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600 shadow-card">
            🖨️ 打印 / 保存 PDF
          </button>
          <button
            onClick={() => {
              const txt = [
                `# VocabTest 默写纸 · ${new Date().toLocaleString()}`,
                '# 左边抄写中文，右边填英文；每行 = 1 词',
                '',
                ...list.map(u => `${u.tran}${' '.repeat(Math.max(1, 20 - u.tran.length))}________________________________________  ${u.level ? `L${u.level}` : ''}  ${u.word ? '' : ''}`),
                '',
                '# 参考答案（折叠打印时请剪掉此段）:',
                ...list.map(u => `${u.tran}  →  ${u.word}`),
              ].join('\n')
              const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `默写纸-${Date.now().toString(36)}.txt`
              document.body.appendChild(a); a.click(); a.remove()
              setTimeout(() => URL.revokeObjectURL(url), 2000)
            }}
            className="h-9 inline-flex items-center rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-3 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
          >📝 下载 TXT</button>
        </div>
      }
    >
      {list.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[rgb(var(--line))] p-10 text-center no-print">
          <div className="text-3xl">🖨️</div>
          <p className="mt-3 text-[rgb(var(--muted))]">
            目前没有需要默写的词。请先完成一次测试，在结果页点击「🖨️ 打开默写页」或「📝 导出未掌握词 TXT」。
          </p>
          <a href="/" className="mt-5 inline-flex items-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 shadow-card">先做一次测试 →</a>
        </div>
      ) : (
        <section className="mt-8 space-y-1 text-base leading-8 font-serif">
          {list.map((u, i) => (
            <div key={i} className="grid grid-cols-[2.5rem_1fr_2fr] gap-4 border-b border-[rgb(var(--line))]/70 py-2">
              <div className="numeric text-[rgb(var(--muted))]">{i + 1}.</div>
              <div className="break-all">{u.tran}{u.level ? <span className="ml-2 text-xs text-[rgb(var(--muted))]">L{u.level}</span> : null}</div>
              <div className="relative">
                {/* 书写横线：下划线 */}
                <span className="absolute inset-x-0 bottom-2 border-b border-dashed border-[rgb(var(--fg))]/50" aria-hidden="true"></span>
                {/* 参考答案（默认隐藏，.show-answers 或打印时是否可配置：用 .answer-toggle 按钮显示） */}
                <span className="print:hidden ml-1 text-xs text-[rgb(var(--muted))] select-all dictation-answer">
                  （答案：<span className="text-[rgb(var(--fg))]/90">{u.word}</span>）
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </PageShell>
  )
}
