import type { Question } from '@/hooks/useQuizEngine'
import { useSpeech } from '@/hooks/useSpeech'

type Step = 'question' | 'reveal'

export default function WordCard({
  q, step, chosenIdx, onSelect,
}: {
  q: Question
  step: Step
  /** reveal 步骤用户选择的下标（0..3）；question 时为 null */
  chosenIdx: number | null
  onSelect: (idx: number) => void
}) {
  const { play, supported } = useSpeech()
  const raw: any = q._raw ?? {}
  const us: string | undefined = typeof raw.us === 'string' ? raw.us : undefined
  const uk: string | undefined = typeof raw.uk === 'string' ? raw.uk : undefined
  const sentences: Array<{ e?: string; c?: string }> = Array.isArray(raw.s) ? raw.s : (raw.sentences ?? raw.y ?? [])
  const exSentence = sentences.find(s => s.e) ?? sentences[0]
  const correct = step === 'reveal' && (chosenIdx === q.correctIdx)
  const wrong = step === 'reveal' && chosenIdx != null && chosenIdx !== q.correctIdx

  return (
    <div
      data-testid="word-card"
      className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 sm:p-8 shadow-card transition"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-4xl sm:text-5xl font-bold tracking-tight break-words">{q.word}</div>
            {supported && (
              <button
                onClick={() => play(q.word)}
                type="button"
                aria-label="朗读发音"
                title="朗读发音"
                className="shrink-0 grid h-9 w-9 place-items-center rounded-full border border-[rgb(var(--line))] bg-[rgb(var(--bg))] text-[rgb(var(--fg))] hover:bg-brand-50 dark:hover:bg-brand-900/30"
              >
                🔊
              </button>
            )}
          </div>
          {(us || uk) && (
            <div className="mt-2 text-sm text-[rgb(var(--muted))]">
              {uk && <span className="mr-3">UK /{uk}/</span>}
              {us && <span>US /{us}/</span>}
            </div>
          )}
          <div className="mt-1 text-xs text-[rgb(var(--muted))]">{q.levelName}</div>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200 shrink-0">
          L{q.level}
        </span>
      </div>

      {/* 4 选 1 释义（始终显示；作答后 reveal 样式） */}
      <ol className="mt-8 space-y-2 list-none">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correctIdx
          const isChosen = chosenIdx === i
          let cls = 'w-full text-left rounded-xl border px-4 py-3 '
          let ring = ''
          if (step === 'reveal') {
            if (isCorrect) { cls += 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-100'; ring = 'ring-1 ring-emerald-400' }
            else if (isChosen) { cls += 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-100'; ring = 'ring-1 ring-rose-400' }
            else { cls += 'bg-[rgb(var(--card))] border-[rgb(var(--line))] text-[rgb(var(--muted))] opacity-70' }
            cls += ' cursor-default '
          } else {
            cls += 'bg-[rgb(var(--card))] border-[rgb(var(--line))] hover:bg-brand-50 dark:hover:bg-brand-900/20 text-[rgb(var(--fg))] active:translate-y-px cursor-pointer '
          }
          return (
            <li key={i}>
              <button
                onClick={() => step === 'question' && onSelect(i)}
                disabled={step !== 'question'}
                className={cls + ring}
                data-testid={`opt-${i}`}
              >
                <span className="inline-block w-6 text-[rgb(var(--muted))]">{i + 1}.</span>
                <span>{opt}</span>
                {step === 'reveal' && isCorrect && <span className="ml-2 font-semibold">✓ 正确</span>}
                {step === 'reveal' && isChosen && !isCorrect && <span className="ml-2 font-semibold">✗ 你的选择</span>}
              </button>
            </li>
          )
        })}
      </ol>

      {/* reveal 反馈（短暂停留后自动下一题；不显示「下一题」按钮） */}
      {step === 'reveal' && (
        <div className="mt-6 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--bg))]/60 p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={
                'rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
                (correct
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                  : wrong
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200')
              }
              data-testid="feedback-tag"
            >
              {correct ? '掌握 +1' : wrong ? '释义选错了' : ''}
            </span>
            <span className="text-sm text-[rgb(var(--muted))]">正确释义：</span>
            <span className="text-sm font-medium text-[rgb(var(--fg))]" data-testid="feedback-correct">{q.correctTran}</span>
            <span className="ml-auto text-xs text-[rgb(var(--muted))]">自动进入下一题…</span>
          </div>
          {exSentence?.e && (
            <div className="mt-3 text-sm leading-6 text-[rgb(var(--fg))]/90">
              <p className="italic">“{exSentence.e}”</p>
              {exSentence.c && <p className="mt-0.5 text-[rgb(var(--muted))]">{exSentence.c}</p>}
            </div>
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-[rgb(var(--muted))]">快捷键：1 / 2 / 3 / 4 = 选择对应释义</p>
    </div>
  )
}
