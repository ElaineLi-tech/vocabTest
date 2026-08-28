import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Dictation from '@/pages/Dictation'

const sampleUnknowns = [
  { word: 'apple', tran: '苹果', level: 1 },
  { word: 'banana', tran: '香蕉', level: 1 },
  { word: 'cherry', tran: '樱桃；紫红色', level: 2 },
]

beforeEach(() => {
  window.sessionStorage.removeItem('vocab-result-json')
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock://dict')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const origA = HTMLAnchorElement.prototype.click
  // prevent real download navigation
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', { value: function () {}, configurable: true })
})

function mountWithState(state: unknown) {
  const initialEntries = [{ pathname: '/dictation', state }] as any
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/dictation" element={<Dictation />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Dictation page (TR-5 默写练习)', () => {
  it('空态：无 state、无 sessionStorage → 空态提示', () => {
    mountWithState(null)
    expect(screen.getByText(/目前没有需要默写的词/)).toBeInTheDocument()
    // header subtitle：共 0 个
    expect(screen.getByText(/共 0 个未掌握词/)).toBeInTheDocument()
  })

  it('传入 3 个 unknown：sub = 共 3 个；条目 1/2/3 含 苹果/香蕉/樱桃；答案显示在 dictation-answer；下载 TXT 含 参考答案 & apple', async () => {
    const blobCap: Blob[] = []
    const origCreate = URL.createObjectURL
    URL.createObjectURL = ((src: any) => {
      if (src instanceof Blob) blobCap.push(src)
      return 'blob://x'
    }) as any
    try {
      mountWithState({ unknown: sampleUnknowns })
      expect(screen.getByText(/共 3 个未掌握词/)).toBeInTheDocument()
      expect(screen.getByText('苹果')).toBeInTheDocument()
      expect(screen.getByText('香蕉')).toBeInTheDocument()
      expect(screen.getByText(/樱桃/)).toBeInTheDocument()
      const answers = document.querySelectorAll('.dictation-answer')
      expect(answers.length).toBe(3)
      expect(answers[0].textContent).toContain('apple')

      // 下载 TXT
      act(() => { fireEvent.click(screen.getByText(/下载 TXT/)) })
      expect(blobCap.length).toBeGreaterThanOrEqual(1)
      const txt = await blobCap[blobCap.length - 1].text()
      expect(txt).toContain('apple')
      expect(txt).toContain('参考答案')
      expect(txt).toContain('樱桃')
    } finally {
      URL.createObjectURL = origCreate
    }
  })
})
