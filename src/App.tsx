import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import AccessGate from '@/components/AccessGate'

const Home = lazy(() => import('@/pages/Home'))
const Quiz = lazy(() => import('@/pages/Quiz'))
const Result = lazy(() => import('@/pages/Result'))
const History = lazy(() => import('@/pages/History'))
const Dictation = lazy(() => import('@/pages/Dictation'))

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-brand-600 numeric">加载中…</div>
    </div>
  )
}

/**
 * App 路由：
 *
 * - 最外层 <AccessGate> = 全站拦截。未授权 → Gate 全屏输入授权码；授权通过 → 才渲染 Suspense + Routes。
 * - 因此用户无论跳 `/#/`、`/#/quiz`、`/#/result`、`/#/history`、`/#/dictation`，只要没授权一律进 Gate，
 *   不需要在 Quiz / Result 里加"二次校验"，因为 Routes 不会被渲染（懒加载的 code-split 页面也不会 fetch）。
 * - 授权有效期 30 天（管理员永久），过期或管理员手动撤销 hash 白名单 → AccessGate 读取时自动失效回 Gate。
 */
export default function App() {
  return (
    <AccessGate>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/result" element={<Result />} />
          <Route path="/history" element={<History />} />
          <Route path="/dictation" element={<Dictation />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </AccessGate>
  )
}
