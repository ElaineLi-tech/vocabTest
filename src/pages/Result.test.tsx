import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Result from '@/pages/Result'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.removeItem('vocab-result-json')
})

function mount(entries = ['/result']) {
  // mock Blob & URL.createObjectURL & document.createElement('a').click 不做网络请求
  return render(<Result />, { wrapper: ({ children }) => <MemoryRouter initialEntries={entries}>{children}</MemoryRouter> })
}

/** 等待 demo 结果渲染 */
async function ready() {
  await waitFor(() => expect(screen.getByTestId('result-total')).toBeInTheDocument(), { timeout: 3000 })
}

describe('Result page (TR-4 / TR-4.2 ~ TR-4.8)', () => {
  it('4 大模块 testid 存在；微信占位、微信号存在', async () => {
    mount()
    await ready()
    expect(screen.getByTestId('module-hero')).toBeInTheDocument()
    expect(screen.getByTestId('module-wechat')).toBeInTheDocument()
    expect(screen.getByTestId('module-breakdown')).toBeInTheDocument()
    expect(screen.getByTestId('module-actions')).toBeInTheDocument()
    expect(screen.getByTestId('wechat-qr-placeholder')).toBeInTheDocument()
    expect(screen.getByTestId('wechat-id').textContent).toBe('VocabTest-Official')
  })

  it('demo：totalVocab = 6200 → band.label 6,000 ~ 8,000，row=5 高亮；对标行文案含「专四 / 雅思 7 分线」', async () => {
    mount()
    await ready()
    expect(screen.getByTestId('result-total').textContent).toBe('6,200')
    expect(screen.getByTestId('result-band-label').textContent).toContain('6,000 ~ 8,000')
    const official = screen.getByTestId('result-band-official').textContent ?? ''
    expect(official).toMatch(/专四|雅思 7/)
    const row5 = screen.getByTestId('lookup-row-5')
    // 高亮 row5 含有 bg-brand-500 类（文本白）
    expect(row5.className).toContain('bg-brand-500')
    // 非高亮对照
    expect(screen.getByTestId('lookup-row-4').className).not.toContain('bg-brand-500')
  })

  it('10 档明细 per-level-list 10 项；L4 显示 mastered/sampled = 6 / 10；L4 未掌握标签 1 个；L5 未掌握标签 2 个', async () => {
    mount()
    await ready()
    const list = screen.getByTestId('per-level-list')
    const lis = within(list).getAllByRole('listitem')
    expect(lis.length).toBe(10)
    const L4 = lis[3]
    expect(L4.textContent).toContain('6 / 10')
    // 未掌握：L4=1 L5=2
    const L4Badge = within(L4).getByText(/未掌握 1/)
    expect(L4Badge).toBeTruthy()
    const L5 = lis[4]
    within(L5).getByText(/未掌握 2/)
  })

  it('保存历史 → 成功提示；再读 storage：getAll 长度=1；txt 导出 blob 内包含 ability-x / ample-y / boost-y 三词', async () => {
    // 记录真实 createObjectURL 收到的 Blob
    const blobCaptures: Blob[] = []
    const origA = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { /* suppress real download */ }
    vi.spyOn(URL, 'createObjectURL').mockImplementation((src: any) => {
      if (src instanceof Blob) blobCaptures.push(src)
      return 'blob:mock://x'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    try {
      mount()
      await ready()
      // 1) 保存历史
      act(() => { fireEvent.click(screen.getByTestId('btn-save-history')) })
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已保存到本地历史记录'))
      // 历史记录真实写入
      const raw = window.localStorage.getItem('vocab:history')
      expect(raw).toBeTruthy()
      const arr = JSON.parse(raw!)
      expect(Array.isArray(arr)).toBe(true)
      expect(arr.length).toBe(1)
      expect(arr[0].totalVocab).toBe(6200)

      // 2) 导出 TXT：验证内容
      act(() => { fireEvent.click(screen.getByTestId('btn-txt')) })
      expect(blobCaptures.length).toBeGreaterThanOrEqual(1)
      const lastBlob = blobCaptures[blobCaptures.length - 1]
      const txt = await lastBlob.text()
      expect(txt).toContain('ability-x')
      expect(txt).toContain('ample-y')
      expect(txt).toContain('boost-y')
      expect(txt).toContain('# 格式: 单词 | 释义 | 档位')
    } finally {
      vi.restoreAllMocks()
      HTMLAnchorElement.prototype.click = origA
    }
  })

  it('对照表 10 行齐全：0..9 lookup-row-*', async () => {
    mount()
    await ready()
    for (let r = 0; r < 10; r++) {
      expect(screen.getByTestId(`lookup-row-${r}`)).toBeInTheDocument()
    }
  })
})
