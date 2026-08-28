import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import History from '@/pages/History'
import type { QuizRecord } from '@/hooks/useStorage'

const KEY = 'vocab:history'

function make(id: string, totalVocab: number, mode: 'fast' | 'precise' = 'fast'): QuizRecord {
  return {
    id, mode, date: 1700000000000 + Number(id.replace(/[^0-9]/g, '') || 0),
    totalVocab, ci: 6,
    perLevel: [
      { level: 4, name: 'CET-4 四级', mastered: 6, sampled: 10, levelTotal: 7508, unknown: [{ word: `w-${id}`, tran: `词(${id})`, level: 4 }] },
      { level: 5, name: 'CET-6 六级', mastered: 3, sampled: 10, levelTotal: 5651, unknown: [] },
    ],
  }
}

function seed(n: number, start = 0): QuizRecord[] {
  const arr: QuizRecord[] = []
  for (let i = 0; i < n; i++) arr.push(make(`r${start + i}`, 1000 + (start + i) * 200, (start + i) % 2 === 0 ? 'fast' : 'precise'))
  // useStorage.saveRecord 是 unshift，因此 arr 的顺序是：最新在最前；我们这里直接用写 localStorage 的方式实现，顺序与 seed 一致（用 saveRecord 的 unshift 语义会把后来的放在最前，这里用 reverse 一下保证与实现一致）
  return arr
}

function saveSeeded(records: QuizRecord[]) {
  // 与 useStorage.saveRecord 一致：最新的放最前；最多保留 MAX=20 条
  const sorted: QuizRecord[] = [...records].reverse().slice(0, 20)
  window.localStorage.setItem(KEY, JSON.stringify(sorted))
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.stubGlobal('confirm', () => true)
})

function mount() {
  return render(<History />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/history']}>{children}</MemoryRouter> })
}

describe('History page (TR-5 历史记录)', () => {
  it('空态 0 条 → 提示 + CTA；无 clear-all 按钮', () => {
    mount()
    expect(screen.getByText(/还没有保存的记录/)).toBeInTheDocument()
    expect(screen.getByText(/现在开始第一次测试/)).toBeInTheDocument()
    expect(screen.queryByTestId('btn-clear-all')).toBeNull()
  })

  it('seed 22 条（r0..r21） → 渲染 20 条；首条 r21(5200)；末条 r2(1400)；r0/r1 被挤出', () => {
    saveSeeded(seed(22, 0))
    mount()
    const cards = screen.getAllByTestId('history-card')
    expect(cards.length).toBe(20)
    for (const c of cards) within(c).getByTestId('hist-official')
    const first = cards[0].querySelector('.text-3xl')?.textContent?.replace(/,/g, '')
    const last = cards[19].querySelector('.text-3xl')?.textContent?.replace(/,/g, '')
    expect(first).toBe('5200') // r21
    expect(last).toBe('1400')  // r2
  })

  it('seed 3 → 删除第一条 → 剩 2 条；首条 5000 (r20)', () => {
    saveSeeded(seed(3, 19)) // r19=4800, r20=5000, r21=5200 → 存储 [r21,r20,r19]；渲染顺序同存储
    mount()
    const before = screen.getAllByTestId('history-card')
    expect(before.length).toBe(3)
    act(() => { fireEvent.click(within(before[0]).getByTestId('btn-del')) })
    const after = screen.getAllByTestId('history-card')
    expect(after.length).toBe(2)
    expect(after[0].querySelector('.text-3xl')?.textContent?.replace(/,/g, '')).toBe('5000')
  })

  it('seed 2 → 清空 btn-clear-all；再 seed 1，点查看报告写入 sessionStorage', () => {
    saveSeeded(seed(2, 0))
    mount()
    expect(screen.getAllByTestId('history-card').length).toBe(2)
    act(() => { fireEvent.click(screen.getByTestId('btn-clear-all')) })
    expect(screen.queryAllByTestId('history-card').length).toBe(0)
    expect(screen.getByText(/还没有保存的记录/)).toBeInTheDocument()

    // 再挂载：重新 seed 1 + mount
    window.localStorage.clear()
    saveSeeded(seed(1, 99))
    render(<History />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/history']}>{children}</MemoryRouter> })
    const v = screen.getAllByTestId('history-card')[0]
    act(() => { fireEvent.click(within(v).getByTestId('btn-view')) })
    const raw = window.sessionStorage.getItem('vocab-result-json')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.totalVocab).toBe(1000 + 99 * 200) // r99
  })
})
