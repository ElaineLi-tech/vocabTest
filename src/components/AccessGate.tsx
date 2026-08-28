import PageShell from '@/components/PageShell'
import { normalizeCode, persistGrant, readGrant, revokeGrant, verifyCode, type AccessGrant, VALID_DAYS } from '@/utils/access'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const WECHAT_IMG = '/微信二维码.jpg'

/**
 * 全站授权 Gate。
 *
 *  - 包裹 `<App>`，未授权 → 渲染 Gate 输入界面；已授权且未过期 → 直接渲染 `{children}`（整棵路由）。
 *  - localStorage 持久化 30 天（管理员码永久）。
 *  - 读取时会对白名单再次校验：如果你后续从 `ALLOWED_CODE_HASHES` 里移除某 hash，对应设备立即失效。
 */
export default function AccessGate(props: { children: React.ReactNode }) {
  // memo 一次，避免每次 React 重渲染 readStorage 重复扫 hash 数组
  const initial = useMemo<AccessGrant | null>(() => (typeof window === 'undefined' ? null : readGrant()), [])
  const [grant, setGrant] = useState<AccessGrant | null>(initial)
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false)

  // 允许 Ctrl+Shift+R 直接切回 Gate（开发者自测用，不暴露 UI）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault()
        revokeGrant(); setGrant(null); setInput(''); setErr('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * 自动格式化：任何用户输入（粘贴 / 逐字符敲 / 用 _ 或 . 分隔 / 忘写 VT- 前缀 / 输错 0 变 O 等）
   * 全部交给 normalizeCode → 返回 VT-XXXX-XXXX-XXXX-XXXX 格式（未满 16 位按部分填充，满 16 位格式合法）。
   */
  const onInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setInput(normalizeCode(e.target.value));
  }

  const tryVerify = useCallback(async (raw: string) => {
    setBusy(true); setErr('')
    try {
      const res = await verifyCode(raw)
      if (!res.ok) {
        setErr(res.reason || '授权码无效')
        setGrant(null)
        return
      }
      // @ts-expect-error codeHash 是 VerifyResult 的可选字段，但 verifyCode ok=true 路径一定带 codeHash
      const g = persistGrant(res)
      setGrant(g)
    } catch (e) {
      setErr('校验出错，请刷新页面重试：' + String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }, [])

  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault()
    if (busy) return
    void tryVerify(input)
  }

  // 已授权 → 放行整棵 App 路由
  if (grant) {
    return <AccessGateRuntime grant={grant} revoke={() => setShowRevokeConfirm(true)}>{props.children}</AccessGateRuntime>
  }

  return (
    <PageShell title="授权验证" subtitle="VocabTest 为付费服务，请输入购买获得的 16 位授权码解锁全站功能">
      <div className="py-10">
        <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-2 items-stretch">

          {/* 左侧：产品介绍 + 购买微信导流，不让陌生访客看到空白 Gate 就直接走 */}
          <section className="rounded-2xl border border-[rgb(var(--line))] bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/30 dark:to-slate-900 p-6 sm:p-8 shadow-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-500 grid place-items-center text-white font-bold shadow-inner">V</div>
              <div>
                <div className="text-lg font-extrabold tracking-tight">VocabTest · 英语词汇量测试</div>
                <div className="text-xs text-[rgb(var(--muted))]">去重 6.4 万+ 词 · 自适应出题 · 对标高考/四六级/雅思托福</div>
              </div>
            </div>

            <ul className="mt-6 space-y-3 text-sm leading-7">
              <li className="flex gap-3 items-start">
                <span className="mt-0.5 inline-flex w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-200 grid place-items-center text-sm">📚</span>
                <div><b>词库权威：</b>源自 23 本主流教材与考试词书，去重 6.4 万 + 词条，覆盖小学 → GRE 全部难度</div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="mt-0.5 inline-flex w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-200 grid place-items-center text-sm">🧠</span>
                <div><b>自适应出题：</b>系统随你的水平自动升/降难度，不刁难也不放水</div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="mt-0.5 inline-flex w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200 grid place-items-center text-sm">📊</span>
                <div><b>统计估算：</b>10 档分层抽样 + 猜测去偏 + 置信区间，用科学样本算出真实词汇量</div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="mt-0.5 inline-flex w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200 grid place-items-center text-sm">🏆</span>
                <div><b>直接对标考试：</b>高考/四六级/专四专八/雅思托福百分位一键对照</div>
              </li>
            </ul>

            <div className="mt-8 rounded-xl border border-[rgb(var(--line))] bg-white/70 dark:bg-slate-900/60 p-4 sm:p-5">
              <div className="text-sm font-semibold text-brand-700 dark:text-brand-200">🛒 还没购买？</div>
              <p className="mt-1 text-sm text-[rgb(var(--muted))] leading-6">添加微信号，发送「<b>购买词汇量测试</b>」，可单用户购买或团队批量授权。</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="w-32 h-32 rounded-xl bg-white shadow-card overflow-hidden grid place-items-center">
                  <img src={WECHAT_IMG} alt="购买微信二维码" className="w-full h-full object-cover select-none" loading="eager" draggable={false} />
                </div>
                <div className="text-sm leading-7">
                  <div className="flex items-center gap-2"><span className="text-[rgb(var(--muted))]">微信 ID：</span><code className="rounded-md bg-[rgb(var(--bg))] px-2 py-0.5 text-[rgb(var(--fg))] select-all">Alina0100302</code></div>
                  <div className="mt-1 text-[rgb(var(--muted))]">授权码有效期：{VALID_DAYS} 天（管理员永久）</div>
                  <div className="mt-1 text-[rgb(var(--muted))]">VIP 学习包：剑桥原版教材 + 语境记单词手册 + 21 天背词计划</div>
                </div>
              </div>
            </div>
          </section>

          {/* 右侧：输入授权码 */}
          <section className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 sm:p-8 shadow-card flex flex-col justify-center">
            <h1 className="text-2xl font-extrabold tracking-tight">🔐 输入授权码解锁</h1>
            <p className="mt-1 text-sm text-[rgb(var(--muted))] leading-6">授权码格式 <code className="rounded bg-[rgb(var(--bg))] px-1.5 py-0.5 text-xs">VT-XXXX-XXXX-XXXX-XXXX</code>，输完一次后，同一浏览器有效期 {VALID_DAYS} 天。</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[rgb(var(--muted))] mb-1.5">授权码</label>
                <input
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  className="w-full tracking-[0.2em] text-center font-mono text-lg px-3 py-3 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--bg))] focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 placeholder:text-[rgb(var(--muted))]/60"
                  placeholder="VT-____-____-____-____"
                  maxLength={22}
                  value={input}
                  onChange={onInputChange}
                  disabled={busy}
                  aria-label="授权码"
                />
              </div>

              {err ? (
                <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-200 px-4 py-2.5 text-sm leading-6" role="alert">
                  {err}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={busy || input.length < 10}
                className="w-full inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-base font-semibold text-white hover:bg-brand-600 disabled:bg-brand-500/60 disabled:cursor-not-allowed shadow-card"
              >
                {busy ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    正在校验…
                  </>
                ) : '✨ 解锁 VocabTest'}
              </button>
            </form>

            {/* 小字：管理员想清空当前设备授权，点击弹确认 */}
            <button
              type="button"
              onClick={() => setShowRevokeConfirm(true)}
              className="mt-6 self-start text-xs text-[rgb(var(--muted))] underline-offset-2 hover:underline decoration-dotted"
            >管理员：清空当前设备授权码
            </button>
          </section>
        </div>

        <p className="mt-10 text-center text-xs text-[rgb(var(--muted))]">若授权码无法使用或购买咨询，请联系微信号 Alina0100302。</p>
      </div>

      {/* 管理员：清空授权码二次确认 modal */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 z-[90] bg-black/50 grid place-items-center p-4" onClick={() => setShowRevokeConfirm(false)} role="dialog" aria-modal="true" aria-label="清空授权码">
          <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 shadow-card" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold">确定清空本机授权吗？</h3>
            <p className="mt-1 text-sm text-[rgb(var(--muted))] leading-6">清空后需要重新输入授权码才能使用。管理员码、普通码都会被清除。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center rounded-xl border border-[rgb(var(--line))] px-4 py-2 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
                onClick={() => setShowRevokeConfirm(false)}
              >取消</button>
              <button
                type="button"
                className="inline-flex items-center rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600"
                onClick={() => { revokeGrant(); setGrant(null); setInput(''); setErr(''); setShowRevokeConfirm(false) }}
              >确定清空</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}

/**
 * 运行时包裹：授权期内正常渲染 children；同时挂载一个"每周一次"的后台轻校验：
 * 读 grant → 二次确认 hash 仍在白名单里 → 如果被你从白名单移除了，立即踢回 Gate（不依赖用户刷新）。
 * 还挂了一个 `window.__VT_REVOKE__ = () => revokeGrant(); location.reload()`，方便后台/Console 应急撤销。
 */
function AccessGateRuntime(props: { children: React.ReactNode; grant: AccessGrant; revoke: () => void }) {
  const lastCheckRef = useRef(0)
  useEffect(() => {
    // @ts-expect-error - 导出 debug helper
    window.__VT_REVOKE__ = () => { revokeGrant(); location.reload() }
  }, [])
  useEffect(() => {
    // 每 12 小时扫一次 readGrant（轻量：只扫 100 个字符串 includes；同时顺便看有没有过期）
    const id = window.setInterval(() => {
      const now = Date.now()
      if (now - lastCheckRef.current < 12 * 3600 * 1000) return
      lastCheckRef.current = now
      const fresh = readGrant()
      if (!fresh) {
        // 失效：把 Gate 重新展示（通过 dispatchEvent 通知外层 AccessGate，这里父组件没注入，降级为 reload 让 Gate 重挂载）
        location.reload()
      }
    }, 3 * 3600 * 1000) // 每 3 小时一次定时器，但内部 gate 到 12h 才真的跑 readGrant（省 CPU）
    return () => clearInterval(id)
  }, [])
  void props.revoke // revoking through UI handled in outer Gate via modal; pass in unused
  return <>{props.children}</>
}
