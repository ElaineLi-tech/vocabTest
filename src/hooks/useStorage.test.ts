import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useStorage } from '@/hooks/useStorage'

beforeEach(() => window.localStorage.clear())

describe('useStorage (TR-2.6)', () => {
  it('写入 22 条 → getAll 仅返回最新 20 条', () => {
    const { result } = renderHook(() => useStorage())
    for (let i = 0; i < 22; i++) {
      act(() => result.current.saveRecord({
        id: `r${i}`, date: i, mode: 'fast', totalVocab: 1000 + i, ci: 5, perLevel: [],
      }))
    }
    const all = result.current.getHistory()
    expect(all.length).toBe(20)
    expect(all[0].id).toBe('r21')   // 最新的在最前
    expect(all[19].id).toBe('r2')   // 最旧的 r0 / r1 已被挤出
  })

  it('delete 单条 + clear 全量', () => {
    const { result } = renderHook(() => useStorage())
    for (let i = 0; i < 3; i++) {
      act(() => result.current.saveRecord({
        id: `a${i}`, date: i, mode: 'fast', totalVocab: 1000, ci: 5, perLevel: [],
      }))
    }
    act(() => result.current.deleteRecord('a1'))
    expect(result.current.getHistory().map(r => r.id)).toEqual(['a2', 'a0'])
    act(() => result.current.clearHistory())
    expect(result.current.getHistory()).toEqual([])
  })
})
