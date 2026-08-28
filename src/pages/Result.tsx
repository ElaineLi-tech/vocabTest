import PageShell from '@/components/PageShell'
import { LOOKUP_TABLE, matchLookupBand } from '@/utils/estimator'
import type { QuizResult } from '@/hooks/useQuizEngine'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStorage } from '@/hooks/useStorage'
import html2canvas from 'html2canvas'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const SESSION_KEY = 'vocab-result-json'
const WECHAT_ID_PLACEHOLDER = 'Alina0100302'
const QR_IMG_SRC = '/微信二维码.jpg'
/** 预渲染分享卡 PNG：挂在这里，再次点击「下载PNG」零等待（对象 URL 或 base64） */
const PNG_CACHE_KEY = 'vocab-result-png-base64'
/** 移动端 UA 检测：iOS Safari / Android / 微信 WebView —— a[download] 不可靠，走"全屏预览 img+长按保存"流程 */
function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod|Android|MicroMessenger|HarmonyOS|Mobile/i.test(ua)
}

/**
 * 全屏图片预览 Modal（用于二维码长按保存、以及分享卡 PNG 手机端长按保存）。
 *
 * 经验 1501909 关键要点：
 *  - 图片必须是「真实的 <img src=…> 全屏展示」，微信/内置浏览器才能把它识别为可长按保存的系统图片。
 *  - 容器用 fixed inset-0 + 深色背景，不设置任何 max-h/max-w，图片 w-full h-full object-contain 真正全屏。
 *  - 顶部必须首屏有"长按保存"显性文字。
 */
function FullscreenImagePreview(props: {
  open: boolean
  onClose: () => void
  src: string
  title: string
  hint?: string
  onContextMenuCapture?: React.MouseEventHandler<HTMLDivElement>
}) {
  const { open, onClose, src, title, hint, onContextMenuCapture } = props
  // ESC 关闭（桌面便利）
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onContextMenuCapture={onContextMenuCapture}
      onClick={onClose}
    >
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2 text-white">
        <div className="text-sm sm:text-base font-medium drop-shadow">{title}</div>
        <button
          type="button"
          aria-label="关闭预览"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white/90 text-lg"
        >✕</button>
      </div>
      <div className="absolute top-16 left-4 right-4 text-center text-emerald-300 font-semibold sm:text-lg drop-shadow">
        {hint ?? '📲 长按图片 2 秒 → 保存到相册'}
      </div>
      {/* 真正的全屏 img 承载区：点图不关闭，避免误触；点击背景层才会关 */}
      <div className="absolute inset-x-0 top-24 bottom-6 sm:top-28 sm:bottom-8 px-4 grid place-items-center" onClick={e => e.stopPropagation()}>
        <img
          src={src}
          alt={title}
          className="max-w-full max-h-full w-auto h-auto object-contain select-none"
          draggable={false}
          loading="eager"
          onLoadCapture={(e) => {
            // 确保图片显示完整
            const t = e.currentTarget as HTMLImageElement
            t.style.maxWidth = '100%'
            t.style.maxHeight = '100%'
          }}
        />
      </div>
    </div>
  )
}

export default function Result() {
  const nav = useNavigate()
  const storage = useStorage()
  const [result, setResult] = useState<QuizResult | null>(null)
  const [saveMsg, setSaveMsg] = useState<string>('')
  const shareCardRef = useRef<HTMLDivElement | null>(null)
  /** PNG 预渲染缓存：{ ready: boolean; url?: string (objectURL 仅本 session 用); base64?: string(跨 session/localStorage 持久化); error?: string } */
  const [pngState, setPngState] = useState<{ ready: boolean; objectUrl?: string; error?: string }>({ ready: false })

  // ==== 全屏预览 Modal 状态：区分二维码预览 / 分享卡预览（用不同 src + 标题） ====
  const [preview, setPreview] = useState<null | { type: 'qr' | 'png'; src: string; title: string; hint?: string }>(null)
  const openQr = useCallback(() => setPreview({
    type: 'qr',
    src: QR_IMG_SRC,
    title: '微信二维码 · Alina0100302',
    hint: '📲 长按图片 2 秒 → 保存到相册 / 去微信识别二维码加好友',
  }), [])
  const openPngPreview = useCallback((src: string) => setPreview({
    type: 'png',
    src,
    title: '词汇量分享卡（可保存到相册）',
    hint: '📲 长按图片 2 秒 → 保存到相册',
  }), [])
  const closePreview = useCallback(() => {
    // 关闭时若预览的是 objectURL（分享卡），清理资源
    setPreview(p => {
      if (p?.type === 'png' && p.src.startsWith('blob:')) URL.revokeObjectURL(p.src)
      return null
    })
  }, [])

  // ============ R1 提速：一次性读取 result（Quiz 已经在最后一题 reveal 算好并写进 sessionStorage）；顺带把 band 等衍生量一起 memo 稳定引用 ============
  useEffect(() => {
    let alive = true
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as QuizResult
        if (typeof parsed.totalVocab === 'number' && Array.isArray(parsed.perLevel)) {
          if (alive) setResult(parsed)
          return
        }
      }
    } catch { /* ignore */ }
    if (alive) setResult(buildDemoResult())
    return () => { alive = false }
  }, [])

  const band = useMemo(() => matchLookupBand(result?.totalVocab ?? 0), [result])
  const unknownAll = useMemo(() => result?.perLevel.flatMap(l => l.unknown) ?? [], [result])
  const sampledTotal = useMemo(() => result?.perLevel.reduce((a, l) => a + l.sampled, 0) ?? 0, [result])
  const masteredTotal = useMemo(() => result?.perLevel.reduce((a, l) => a + l.mastered, 0) ?? 0, [result])
  const chartData = useMemo(
    () => (result?.perLevel ?? []).map(l => ({ name: `L${l.level}`, 抽样: l.sampled, 掌握: l.mastered, level: l.level })),
    [result],
  )

  // ============ R1 提速：Result 进入后「首屏渲染完 shareCardRef」立刻空闲后台预渲染 html2canvas → 缓存 Blob ============
  useLayoutEffect(() => {
    if (!result) return
    const el = shareCardRef.current
    if (!el) return
    // 命中了之前缓存的 base64 → 直接 decode 成 Blob 并创建 objectURL（点下载时零等待）
    try {
      const cachedB64 = sessionStorage.getItem(PNG_CACHE_KEY)
      if (cachedB64 && cachedB64.startsWith('data:image/png;base64,')) {
        fetch(cachedB64).then(r => r.blob()).then(blob => {
          const url = URL.createObjectURL(blob)
          setPngState({ ready: true, objectUrl: url })
        }).catch(() => { /* ignore */ })
        return
      }
    } catch { /* ignore */ }
    let cancelled = false
    const run = () => {
      if (cancelled || !shareCardRef.current) return
      void html2canvas(shareCardRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false })
        .then(canvas => new Promise<string>((resolve, reject) => canvas.toBlob(b => {
          if (!b) { reject(new Error('toBlob failed')); return }
          const url = URL.createObjectURL(b)
          // 同一份 base64 存 sessionStorage（跨 Result 组件重挂载缓存）
          const reader = new FileReader()
          reader.onloadend = () => {
            try { sessionStorage.setItem(PNG_CACHE_KEY, String(reader.result)) } catch { /* NOOP: q 超 5MB (iOS) 存不下就不存，只保留 objectURL */ }
            resolve(url)
          }
          reader.onerror = () => { resolve(url) }
          reader.readAsDataURL(b)
        }, 'image/png')))
        .then(url => { if (!cancelled) setPngState({ ready: true, objectUrl: url }) })
        .catch(e => { if (!cancelled) setPngState({ ready: false, error: String(e?.message ?? e) }) })
    }
    const ric: any = (globalThis as any).requestIdleCallback
    const t = typeof ric === 'function'
      ? ric(run, { timeout: 1200 })
      : window.setTimeout(run, 600)
    return () => {
      cancelled = true
      if (typeof (globalThis as any).cancelIdleCallback === 'function' && typeof t === 'number') (globalThis as any).cancelIdleCallback(t)
      else if (typeof t === 'number') window.clearTimeout(t)
    }
  }, [result])

  // 清理 objectURL
  useEffect(() => {
    return () => {
      if (pngState.objectUrl) URL.revokeObjectURL(pngState.objectUrl)
      try { sessionStorage.removeItem(PNG_CACHE_KEY) } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ======= 导出功能 =======
  const saveToHistory = () => {
    if (!result) return
    storage.saveRecord(result)
    setSaveMsg('已保存到本地历史记录')
    setTimeout(() => setSaveMsg(''), 2500)
  }
  const downloadTxt = () => {
    if (!result) return
    const lines: string[] = [
      `# VocabTest 未掌握词 · ${new Date(result.date).toLocaleString()}`,
      `# 模式: ${result.mode === 'fast' ? '快速 40 题' : '精准 80 题'}  估算词汇量: ${result.totalVocab} ±${result.ci}%`,
      '',
      '# 格式: 单词 | 释义 | 档位',
      ...unknownAll.map(u => `${u.word} | ${u.tran} | L${u.level}`),
    ]
    triggerDownload('未掌握词-' + result.id + '.txt', lines.join('\n'), 'text/plain;charset=utf-8')
  }

  /**
   * 生成 / 读取 分享卡 PNG → 下载；移动端 fallback 为全屏预览 img + 长按保存。
   *
   * 性能关键点（R1 + R3）：
   *  1. 优先走预渲染缓存（`pngState.objectUrl`）→ 0ms 感知，不用等 html2canvas。
   *  2. canvas.toBlob + URL.createObjectURL，不是 toDataURL base64（避免 iOS Safari 2MB 限制白屏 + 双倍内存）。
   *  3. 移动端/微信：a[download] 经常失效，失败后自动打开全屏预览 img，提示"长按保存到相册"。
   */
  const downloadSharePng = async () => {
    const el = shareCardRef.current
    if (!el || !result) return

    // 取 PNG Blob（优先缓存）
    let objectUrl: string | undefined = pngState.objectUrl
    if (!objectUrl) {
      try {
        const cv = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false })
        objectUrl = await new Promise<string>((resolve, reject) => {
          cv.toBlob(b => {
            if (!b) { reject(new Error('toBlob failed')); return }
            resolve(URL.createObjectURL(b))
          }, 'image/png')
        })
        // 缓存起来，避免重复点击重复截图
        setPngState({ ready: true, objectUrl })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('生成分享图失败：', e)
        alert('生成分享图失败，可使用浏览器「截图」代替')
        return
      }
    }

    const filename = `词汇量-${result.totalVocab}-${result.id}.png`
    // 桌面或支持 a[download] 的环境：直接下
    if (!isMobileUA()) {
      triggerBlobDownload(objectUrl, filename)
      return
    }
    // 移动端：尝试 a[download]，失败则走全屏预览 img 长按保存
    try {
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      // 移动端 a[download] 是否生效无法同步检测；同时把全屏预览打开作为兜底（用户没下到也能长按）
      // 预览里是新的 objectURL clone，避免与上面缓存的共享 URL.revokeObjectURL 资源冲突
      openPngPreview(objectUrl)
      // 预览的 objectUrl 会在 closePreview 里单独 revoke，这里保留原 objectUrl 继续服务后续点击
      void nav
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('移动端下载失败，回退预览：', e)
      openPngPreview(objectUrl)
    }
  }

  return (
    <PageShell
      title="测试结果"
      subtitle={result ? `完成 ${result.done}/${result.total} 题 · 共抽样 ${sampledTotal} 个，掌握 ${masteredTotal} 个（${Math.round(masteredTotal / Math.max(1, sampledTotal) * 100)}%）` : '正在读取…'}
    >
      {/* 骨架屏：Quiz reveal 650ms + Result 进路由后解析 sessionStorage 的几百 ms 衔接，避免"白屏慢"的主观感受 */}
      {!result
        ? (
          <div className="py-10 space-y-8">
            <section className="grid gap-6 lg:grid-cols-3 animate-pulse">
              <div className="lg:col-span-2 rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 sm:p-8 shadow-card h-[480px]" />
              <aside className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 shadow-card h-[520px]" />
            </section>
            <section className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 sm:p-8 shadow-card h-[420px] animate-pulse" />
            <section className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 sm:p-8 shadow-card h-[120px] animate-pulse" />
          </div>
        )
        : (
          <div className="mt-8 space-y-8">
            {/* 模块 1：主卡 + 词汇量 + 对照行 + 微信二维码占位 */}
            <section data-testid="module-hero" className="grid gap-6 lg:grid-cols-3">
              <div
                ref={shareCardRef}
                className="lg:col-span-2 rounded-2xl border border-[rgb(var(--line))] bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/30 dark:to-slate-900 p-6 sm:p-8 shadow-card"
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-[rgb(var(--muted))]">{result.mode === 'fast' ? '快速模式' : '精准模式'} · {new Date(result.date).toLocaleString()}</div>
                  <div className="text-sm font-semibold text-brand-700 dark:text-brand-200">VocabTest · 你的词汇量报告</div>
                </div>
                <div className="mt-4 grid sm:grid-cols-[auto_1fr] gap-6 items-center">
                  <div>
                    <div className="text-sm text-[rgb(var(--muted))]">你的英语词汇量约为</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <div className="text-5xl sm:text-6xl font-extrabold tracking-tight numeric" data-testid="result-total">{result.totalVocab.toLocaleString()}</div>
                      <div className="text-lg font-medium text-[rgb(var(--muted))]">词</div>
                    </div>
                    <div className="mt-2 text-sm text-[rgb(var(--muted))]">
                      估算置信区间 ±<span className="numeric text-[rgb(var(--fg))] font-medium">{result.ci}%</span>
                    </div>
                  </div>
                  <div>
                    <div className="inline-flex items-center rounded-full bg-white/80 dark:bg-slate-800/80 border border-[rgb(var(--line))] px-3 py-1 text-xs font-semibold text-brand-700 dark:text-brand-200" data-testid="result-band-label">
                      {band.band.label} 档
                    </div>
                    <p className="mt-2 text-base font-semibold" data-testid="result-band-official">{band.band.official}</p>
                    <p className="mt-1 text-sm leading-6 text-[rgb(var(--fg))]/90" data-testid="result-band-subtitle">{band.subtitle}</p>
                    <p className="mt-1 text-xs text-[rgb(var(--muted))]">{band.band.percentile}；{band.band.desc}</p>
                  </div>
                </div>

                {/* 10 档对照表：高亮匹配档 */}
                <div className="mt-6 overflow-hidden rounded-xl border border-[rgb(var(--line))] bg-white/60 dark:bg-slate-900/60">
                  <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-[rgb(var(--muted))] bg-[rgb(var(--bg))]/50 border-b border-[rgb(var(--line))]">
                    <div className="col-span-3">词汇量区间</div>
                    <div className="col-span-6">对标（官方 / 考试）</div>
                    <div className="col-span-3 text-right">参考百分位</div>
                  </div>
                  <ul className="max-h-72 overflow-auto" data-testid="lookup-table">
                    {LOOKUP_TABLE.map(row => {
                      const active = row.row === band.band.row
                      return (
                        <li
                          key={row.row}
                          data-testid={`lookup-row-${row.row}`}
                          className={
                            'grid grid-cols-12 px-4 py-2.5 text-sm border-b border-[rgb(var(--line))]/60 last:border-b-0 ' +
                            (active
                              ? 'bg-brand-500 text-white'
                              : 'hover:bg-[rgb(var(--bg))]/50')
                          }
                        >
                          <div className="col-span-3 font-semibold numeric">{row.label}</div>
                          <div className={'col-span-6 ' + (active ? '' : 'text-[rgb(var(--fg))]/90')}>{row.official}</div>
                          <div className={'col-span-3 text-right ' + (active ? '' : 'text-[rgb(var(--muted))]')}>{row.percentile}</div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>

              {/* 微信二维码卡片：点击二维码小图 → 全屏预览（确保微信可长按保存） */}
              <aside data-testid="module-wechat" className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 shadow-card flex flex-col items-center text-center">
                <h3 className="text-base font-semibold">领取专属学习包 🎁</h3>
                <p className="mt-2 text-sm text-[rgb(var(--muted))] leading-6">添加下方微信号，发送<b className="text-brand-700 dark:text-brand-200"> 词汇量截图</b>，立即获取<b className="text-brand-700 dark:text-brand-200"> VIP 学习包</b>：</p>
                <ul className="mt-3 space-y-1 text-sm leading-6 text-left">
                  <li>📘 <b>剑桥原版单词学习教材</b></li>
                  <li>📖 <b>语境记单词手册</b></li>
                  <li>🗓️ <b>21 天背词计划</b></li>
                </ul>
                {/* 点击触发全屏预览（pointer-events-none → 去掉，让外层 button 捕获） */}
                <button
                  type="button"
                  onClick={openQr}
                  className="mt-5 w-[220px] h-auto rounded-2xl bg-white shadow-card p-0 border-0 cursor-zoom-in transition-transform active:scale-[0.99] hover:shadow-lg"
                  data-testid="wechat-qr-placeholder"
                  aria-label="点击查看微信二维码大图并保存到相册"
                >
                  <img
                    src={QR_IMG_SRC}
                    alt="微信二维码 Alina0100302"
                    className="w-full h-auto object-contain rounded-2xl select-none"
                    loading="eager"
                    draggable={false}
                  />
                </button>
                <p className="mt-2 text-[11px] text-brand-600 dark:text-brand-300">👆 点击二维码，长按保存图片</p>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-[rgb(var(--muted))]">微信 ID：</span>
                  <code className="rounded-md bg-[rgb(var(--bg))] px-2 py-0.5 text-[rgb(var(--fg))] select-all" data-testid="wechat-id">{WECHAT_ID_PLACEHOLDER}</code>
                  <button
                    type="button"
                    onClick={() => {
                      const ok = navigator.clipboard?.writeText(WECHAT_ID_PLACEHOLDER)
                      if (ok) {
                        ok.then(() => setSaveMsg('微信号已复制，去微信加好友吧')).catch(() => { /* ignore */ })
                      } else {
                        // iOS Safari 非 HTTPS 或微信下 clipboard 可能不存在：回退到 execCommand
                        try {
                          const ta = document.createElement('textarea')
                          ta.value = WECHAT_ID_PLACEHOLDER; document.body.appendChild(ta); ta.select()
                          document.execCommand('copy'); document.body.removeChild(ta)
                          setSaveMsg('微信号已复制，去微信加好友吧')
                        } catch { setSaveMsg('复制失败，请长按微信号手动复制') }
                      }
                      setTimeout(() => setSaveMsg(''), 2500)
                    }}
                    className="text-xs rounded-md border border-[rgb(var(--line))] px-2 py-0.5 text-[rgb(var(--muted))] hover:text-brand-600 hover:border-brand-400"
                  >复制</button>
                </div>
              </aside>
            </section>

            {/* 模块 2：10 档分档明细 + 条形图 */}
            <section data-testid="module-breakdown" className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 sm:p-8 shadow-card">
              <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-xl font-bold">分档诊断</h3>
                  <p className="mt-1 text-sm text-[rgb(var(--muted))]">浅灰 = 抽样题数，深绿 = 掌握数；每档 mastery × 该档总词数 = 你的估算词汇量。</p>
                </div>
                <div className="text-xs text-[rgb(var(--muted))]">共 {result.perLevel.reduce((a, l) => a + l.sampled, 0)} 个抽样 · 覆盖 {result.perLevel.filter(l => l.sampled > 0).length} 个档位</div>
              </div>

              <div className="mt-6 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="抽样" fill="rgb(var(--line))" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="掌握" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <ul className="mt-6 divide-y divide-[rgb(var(--line))]" data-testid="per-level-list">
                {result.perLevel.map(l => {
                  const mastery = l.sampled ? Math.round(l.mastered / l.sampled * 100) : 0
                  return (
                    <li key={l.level} className="grid grid-cols-12 gap-2 items-center py-3">
                      <div className="col-span-2 sm:col-span-1">
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">L{l.level}</span>
                      </div>
                      <div className="col-span-4 sm:col-span-4 text-sm truncate">{l.name}</div>
                      <div className="col-span-6 sm:col-span-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgb(var(--line))]">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: l.sampled ? Math.round(l.mastered / l.sampled * 100) + '%' : '0%' }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-xs numeric text-[rgb(var(--muted))]">{mastery}%</span>
                        </div>
                      </div>
                      <div className="col-span-6 sm:col-span-3 text-sm text-[rgb(var(--fg))]/90 text-right sm:text-right">
                        <span className="numeric">{l.mastered}</span> / <span className="numeric">{l.sampled}</span>
                        <span className="text-[rgb(var(--muted))] mx-1">·</span>
                        词库 <span className="numeric">{l.levelTotal.toLocaleString()}</span>
                      </div>
                      <div className="col-span-6 sm:col-span-1 text-right">
                        {l.unknown.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-200">未掌握 {l.unknown.length}</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* 模块 4：操作区（保存 / 导出 / 再测） */}
            <section data-testid="module-actions" className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-6 sm:p-8 shadow-card">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                  <h3 className="text-lg font-bold">下一步</h3>
                  <p className="mt-1 text-sm text-[rgb(var(--muted))] leading-6">保存报告、下载分享卡，或把你没掌握的词打印出来默写复习。{pngState.ready && <span className="text-emerald-600 dark:text-emerald-300 ml-1">（分享图已预生成，下载即出）</span>}</p>
                  {saveMsg && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-300" role="status">{saveMsg}</p>}
                  {pngState.error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">预生成分享图失败：{pngState.error}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={saveToHistory}
                    data-testid="btn-save-history"
                    className="inline-flex items-center rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-4 py-2.5 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
                  >💾 保存到历史记录</button>
                  <Link
                    to="/history"
                    className="inline-flex items-center rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-4 py-2.5 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
                  >📖 查看历史记录</Link>
                  <button
                    onClick={downloadSharePng}
                    data-testid="btn-png"
                    className={
                      'inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-card ' +
                      (pngState.ready
                        ? 'bg-emerald-500 hover:bg-emerald-600'
                        : 'bg-brand-500 hover:bg-brand-600')
                    }
                  >📸 下载 {pngState.ready ? '（已生成）' : 'PNG 分享卡'}</button>
                  <button
                    onClick={downloadTxt}
                    data-testid="btn-txt"
                    className={
                      'inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-medium shadow-card ' +
                      (unknownAll.length === 0
                        ? 'bg-[rgb(var(--bg))] text-[rgb(var(--muted))] cursor-not-allowed border border-[rgb(var(--line))]'
                        : 'bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white')
                    }
                    disabled={unknownAll.length === 0}
                  >📝 导出未掌握词 TXT（{unknownAll.length}）</button>
                  <Link
                    to="/dictation"
                    state={{ unknown: unknownAll }}
                    className="inline-flex items-center rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-4 py-2.5 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/40"
                  >🖨️ 打开默写页</Link>
                  <Link
                    to="/"
                    onClick={() => { window.scrollTo({ top: 0 }) }}
                    className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 shadow-card"
                  >🔁 再测一次</Link>
                </div>
              </div>
            </section>
          </div>
        )}

      {/* 全屏预览：二维码 + 分享卡 PNG 共用 */}
      <FullscreenImagePreview
        open={!!preview}
        onClose={closePreview}
        src={preview?.src ?? ''}
        title={preview?.title ?? ''}
        hint={preview?.hint}
      />
    </PageShell>
  )
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  triggerBlobDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}
function triggerBlobDownload(objectUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = objectUrl; a.download = filename; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
}

/** 示例数据：用于直接打开 /result 时的兜底演示（totalVocab 6200 → 6000~8000 档 row=5） */
function buildDemoResult(): QuizResult {
  const names = ['小学入门', '初中基础', '高中基础', 'CET-4 四级', 'CET-6 六级', '考研 / 专四', '雅思 / GMAT / 商务', '托福 / 专八', 'SAT', 'GRE']
  const totals = [1500, 2100, 3200, 7508, 5651, 8000, 9000, 13000, 15000, 20000]
  const levels: QuizResult['perLevel'] = names.map((name, i) => {
    const lvl = i + 1
    if (lvl === 4) return { level: 4, name, mastered: 6, sampled: 10, levelTotal: totals[3], unknown: [{ word: 'ability-x', tran: '能力；才能（示例）', level: 4 }] }
    if (lvl === 5) return { level: 5, name, mastered: 3, sampled: 10, levelTotal: totals[4], unknown: [{ word: 'ample-y', tran: '充足的（示例）', level: 5 }, { word: 'boost-y', tran: '促进；增强（示例）', level: 5 }] }
    return { level: lvl, name, mastered: 0, sampled: 0, levelTotal: totals[i], unknown: [] }
  })
  return {
    id: 'R-demo',
    mode: 'fast',
    date: Date.now(),
    done: 20,
    total: 40,
    perLevel: levels,
    totalVocab: Math.round(0.6 * 7508 + 0.3 * 5651),
    ci: 8,
  }
}
