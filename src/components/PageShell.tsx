import ThemeToggle from '@/components/ThemeToggle'
import { Link } from 'react-router-dom'

export default function PageShell({
  title,
  subtitle,
  children,
  action,
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[rgb(var(--line))] bg-[rgb(var(--bg))]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white font-bold numeric shadow-card">V</span>
            <span className="font-semibold tracking-tight text-[rgb(var(--fg))]">VocabTest</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/history"
              className="inline-flex h-9 items-center rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-3 text-sm text-[rgb(var(--fg))] hover:bg-brand-50 dark:hover:bg-brand-900/40 sm:hidden"
              aria-label="历史记录"
            >📖</Link>
            <Link
              to="/history"
              className="hidden sm:inline-flex h-9 items-center rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-3 text-sm text-[rgb(var(--fg))] hover:bg-brand-50 dark:hover:bg-brand-900/40"
            >历史记录</Link>
            {action}
            <ThemeToggle />
          </div>
        </div>
      </header>
      {(title || subtitle) && (
        <div className="mx-auto max-w-5xl px-4 pt-8">
          <h1 className="rule text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 text-base sm:text-lg text-[rgb(var(--muted))]">
              {subtitle}
            </p>
          )}
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">
        {children}
      </main>
    </div>
  )
}
