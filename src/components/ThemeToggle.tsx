import { useTheme } from '@/hooks/useTheme'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, , toggle] = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      onClick={toggle}
      className={
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--line))] ' +
        'bg-[rgb(var(--card))] text-[rgb(var(--fg))] hover:bg-brand-50 dark:hover:bg-brand-900/40 transition ' +
        className
      }
    >
      <span aria-hidden className="text-lg">{isDark ? '☀️' : '🌙'}</span>
    </button>
  )
}
