import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'

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

export default function App() {
  return (
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
  )
}
