export default function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = Math.min(100, Math.max(0, total ? Math.round((done / total) * 100) : 0))
  return (
    <div aria-label="答题进度" className="w-full">
      <div className="mb-2 flex justify-between text-xs text-[rgb(var(--muted))]">
        <span className="numeric">{done} / {total}</span>
        <span className="numeric">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--line))]">
        <div
          data-testid="progress-fill"
          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-300"
          style={{ width: pct + '%' }}
        />
      </div>
    </div>
  )
}
