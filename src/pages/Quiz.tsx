import PageShell from '@/components/PageShell'
import ProgressBar from '@/components/ProgressBar'
import WordCard from '@/components/WordCard'
import { useQuizEngine } from '@/hooks/useQuizEngine'
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function Quiz() {
  const [params] = useSearchParams()
  const mode = (params.get('mode') as 'fast' | 'precise') || 'fast'
  const nav = useNavigate()
  const engine = useQuizEngine(mode)

  useEffect(() => {
    if (engine.isFinished) {
      try { sessionStorage.setItem('vocab-result-json', JSON.stringify(engine.result)) } catch {}
      nav('/result', { replace: true })
    }
  }, [engine.isFinished, engine.result, nav])

  // 键盘：1 / 2 / 3 / 4 直接选择对应选项
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT','TEXTAREA'].includes(target.tagName)) return
      if (engine.step === 'question' && ['1','2','3','4'].includes(e.key)) {
        engine.actSelect(Number(e.key) - 1)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])

  return (
    <PageShell
      title={mode === 'fast' ? '快速测试' : '精准测试'}
      subtitle="选择你认为正确的中文释义，答对答错都会立刻进入下一题。"
    >
      <div className="mt-6">
        <ProgressBar done={engine.progress.done} total={engine.progress.total} />
      </div>
      <div className="mt-8">
        {engine.loading
          ? <div className="p-10 text-center text-[rgb(var(--muted))]" data-testid="quiz-loading">加载词库，马上开始…</div>
          : engine.currentQuestion
            ? <WordCard
                q={engine.currentQuestion}
                step={engine.step}
                chosenIdx={engine.chosenIdx}
                onSelect={engine.actSelect}
              />
            : engine.isFinished
              ? <div className="p-10 text-center text-[rgb(var(--muted))]">测试完成，跳转结果页…</div>
              : <div className="p-10 text-center text-[rgb(var(--muted))]">准备题目…</div>}
      </div>
    </PageShell>
  )
}
