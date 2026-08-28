import { useCallback, useEffect, useMemo, useState } from 'react'

const KEY_PREFIX = 'vocab:'

export interface QuizRecord {
  id: string
  date: number
  mode: 'fast' | 'precise'
  totalVocab: number
  ci: number
  perLevel: any[]
  detail?: any // 详细答题记录（可选存，建议 < 20KB 总）
}

function read<T = any>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch { return fallback }
}

function write<T>(key: string, value: T) {
  try { localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value)) } catch { /* quota exceeded, ignore */ }
}

const HIST = 'history'
const MAX = 20

export function useStorage() {
  const [, tick] = useState(0)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key?.startsWith(KEY_PREFIX)) tick(x => x + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 保持 API 对象引用稳定，避免依赖此 hook 返回值的 useEffect 发生无限循环
  const api = useMemo(() => ({
    getHistory(): QuizRecord[] {
      const arr = read<QuizRecord[]>(HIST, [])
      return Array.isArray(arr) ? arr : []
    },
    saveRecord(rec: QuizRecord) {
      const arr = read<QuizRecord[]>(HIST, [])
      arr.unshift(rec)
      while (arr.length > MAX) arr.pop()
      write(HIST, arr)
      tick(x => x + 1)
    },
    deleteRecord(id: string) {
      const arr = read<QuizRecord[]>(HIST, []).filter(r => r.id !== id)
      write(HIST, arr)
      tick(x => x + 1)
    },
    clearHistory() {
      write(HIST, [])
      tick(x => x + 1)
    },
    getById(id: string): QuizRecord | undefined {
      return read<QuizRecord[]>(HIST, []).find(r => r.id === id)
    },
    setCurrentResult(payload: any) { write('current-result', payload) },
    getCurrentResult(): any { return read<any>('current-result', null) },
    clearAll() {
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith(KEY_PREFIX)) localStorage.removeItem(k)
        }
      } catch {}
      tick(x => x + 1)
    },
  }), [])
  return api
}
